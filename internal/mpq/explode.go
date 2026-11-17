package mpq

import "errors"

// explode undoes PKWARE Data Compression Library "implode", the way Mark Adler's blast.c does it (zlib contrib/blast).

var (
	litLen  = []byte{11, 124, 8, 7, 28, 7, 188, 13, 76, 4, 10, 8, 12, 10, 12, 10, 8, 23, 8, 9, 7, 6, 7, 8, 7, 6, 55, 8, 23, 24, 12, 11, 7, 9, 11, 12, 6, 7, 22, 5, 7, 24, 6, 11, 9, 6, 7, 22, 7, 11, 38, 7, 9, 8, 25, 11, 8, 11, 9, 12, 8, 12, 5, 38, 5, 38, 5, 11, 7, 5, 6, 21, 6, 10, 53, 8, 7, 24, 10, 27, 44, 253, 253, 253, 252, 252, 252, 13, 12, 45, 12, 45, 12, 61, 12, 45, 44, 173}
	lenLen  = []byte{2, 35, 36, 53, 38, 23}
	distLen = []byte{2, 20, 53, 230, 247, 151, 248}
	lenBase = []int{3, 2, 4, 5, 6, 7, 8, 9, 10, 12, 16, 24, 40, 72, 136, 264}
	lenExtr = []int{0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8}

	litCode, lenCode, distCode = construct(litLen), construct(lenLen), construct(distLen)
)

const maxBits = 13

type huffman struct {
	count  [maxBits + 1]int
	symbol []int
}

// construct builds a code from blast's run-length coded lengths (low 4 bits a length, high 4 bits the repeat count less one).
func construct(rep []byte) *huffman {
	var lengths []int
	for _, b := range rep {
		for n := int(b>>4) + 1; n > 0; n-- {
			lengths = append(lengths, int(b&15))
		}
	}
	h := &huffman{symbol: make([]int, len(lengths))}
	for _, l := range lengths {
		h.count[l]++
	}
	var offs [maxBits + 2]int
	for l := 1; l <= maxBits; l++ {
		offs[l+1] = offs[l] + h.count[l]
	}
	for s, l := range lengths {
		if l != 0 {
			h.symbol[offs[l]] = s
			offs[l]++
		}
	}
	return h
}

type bitReader struct {
	in     []byte
	pos    int
	buf    uint32
	cnt    uint
	failed bool
}

func (r *bitReader) bits(n uint) int {
	for r.cnt < n {
		if r.pos >= len(r.in) {
			r.failed = true
			return 0
		}
		r.buf |= uint32(r.in[r.pos]) << r.cnt
		r.pos++
		r.cnt += 8
	}
	v := r.buf & (1<<n - 1)
	r.buf >>= n
	r.cnt -= n
	return int(v)
}

// decode reads one symbol; the codes are stored with their bits inverted, most significant first.
func (r *bitReader) decode(h *huffman) int {
	code, first, index := 0, 0, 0
	for l := 1; l <= maxBits; l++ {
		code |= r.bits(1) ^ 1
		if r.failed {
			return -1
		}
		count := h.count[l]
		if code-first < count {
			return h.symbol[index+code-first]
		}
		index += count
		first += count
		first <<= 1
		code <<= 1
	}
	return -1
}

func explode(in []byte, want int) ([]byte, error) {
	r := &bitReader{in: in}
	lit := r.bits(8)
	dict := r.bits(8)
	if r.failed || lit > 1 || dict < 4 || dict > 6 {
		return nil, errors.New("not PKWARE imploded data")
	}
	out := make([]byte, 0, want)
	for !r.failed {
		if r.bits(1) != 0 {
			sym := r.decode(lenCode)
			if sym < 0 {
				break
			}
			n := lenBase[sym] + r.bits(uint(lenExtr[sym]))
			if n == 519 { // end of stream
				break
			}
			shift := uint(dict)
			if n == 2 {
				shift = 2
			}
			d := r.decode(distCode)
			if d < 0 {
				break
			}
			dist := d<<shift + r.bits(shift) + 1
			if dist > len(out) {
				return nil, errors.New("distance too far back")
			}
			for i := 0; i < n; i++ {
				out = append(out, out[len(out)-dist])
			}
		} else {
			var c int
			if lit != 0 {
				c = r.decode(litCode)
				if c < 0 {
					break
				}
			} else {
				c = r.bits(8)
			}
			if r.failed {
				break
			}
			out = append(out, byte(c))
		}
	}
	if r.failed && len(out) < want {
		return out, errors.New("imploded data ends early")
	}
	return out, nil
}
