package d2items

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"regexp"
	"strconv"
	"strings"
)

// The inventory pictures, as the game draws them: a .dc6 file from data\global\items with the units palette, recoloured by one of the
// palette shift tables (data\global\items\palette) when the item's base has an InvTrans and its unique, set or magic affix gives a colour.

// shiftFiles are the palette shift tables by InvTrans (Armor.txt and Weapons.txt: 1 grey ... 8 invgreybrown).
var shiftFiles = []string{"", "grey", "grey2", "gold", "brown", "greybrown", "invgrey", "invgrey2", "invgreybrown"}

// Picture names the picture of an item: its .dc6 file, then ".<shift table>.<colour>" when the game recolours it ("invcap", "invrin1",
// "invhlm.8.5"). "" when its base has no picture.
func (t *Tables) Picture(it *Item) string {
	b := t.Bases[it.Code]
	if b == nil {
		return ""
	}
	file := b.InvFile
	if gfx := t.TypeGfx[b.Type]; len(gfx) > 0 && it.Picture < len(gfx) && gfx[it.Picture] != "" {
		file = gfx[it.Picture]
	}
	colour := ""
	switch it.Quality {
	case 7:
		if b.UniqueInv != "" {
			file = b.UniqueInv
		}
		if p, ok := t.UniquePic[it.UniqueID]; ok {
			if p.File != "" {
				file = p.File
			}
			colour = p.Color
		}
	case 5:
		if b.SetInv != "" {
			file = b.SetInv
		}
		if p, ok := t.SetPic[it.SetID]; ok {
			if p.File != "" {
				file = p.File
			}
			colour = p.Color
		}
	case 4:
		if c := t.PrefixColor[it.Prefix]; c != "" {
			colour = c
		}
		if c := t.SuffixColor[it.Suffix]; c != "" {
			colour = c
		}
	case 6, 8:
		for i, a := range it.RareAffixes { // prefix, suffix, prefix...
			c := t.SuffixColor[a]
			if i%2 == 0 {
				c = t.PrefixColor[a]
			}
			if c != "" {
				colour = c
			}
		}
	}
	if file == "" || !picName.MatchString(file) {
		return ""
	}
	if n, ok := t.Colors[colour]; ok && colour != "" && b.InvTrans > 0 && b.InvTrans < len(shiftFiles) {
		return fmt.Sprintf("%s.%d.%d", file, b.InvTrans, n)
	}
	return file
}

var picName = regexp.MustCompile(`^[A-Za-z0-9_]+$`)
var picRef = regexp.MustCompile(`^([A-Za-z0-9_]+)(?:\.([1-8])\.([0-9]{1,2}))?$`)

// PicturePNG draws a picture named by Picture as a PNG, reading the game's files through f.
func PicturePNG(name string, f *Folder) ([]byte, error) {
	m := picRef.FindStringSubmatch(name)
	if m == nil {
		return nil, fmt.Errorf("not a picture name: %q", name)
	}
	pal := f.File(`data\global\palette\units\pal.dat`)
	if len(pal) < 768 {
		return nil, fmt.Errorf("the game's palette was not found")
	}
	dc6 := f.File(`data\global\items\` + m[1] + ".dc6")
	if dc6 == nil {
		return nil, fmt.Errorf("no picture %s.dc6", m[1])
	}
	var shift []byte
	if m[2] != "" {
		trans, _ := strconv.Atoi(m[2])
		colour, _ := strconv.Atoi(m[3])
		if tb := f.File(`data\global\items\palette\` + shiftFiles[trans] + ".dat"); len(tb) >= (colour+1)*256 {
			shift = tb[colour*256 : (colour+1)*256]
		}
	}
	img, err := decodeDC6(dc6, pal, shift)
	if err != nil {
		return nil, fmt.Errorf("%s.dc6: %w", m[1], err)
	}
	var out bytes.Buffer
	if err := png.Encode(&out, img); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

// decodeDC6 draws the first frame of a .dc6 file: palette indices, run-length coded, rows from the bottom up. pal is 256 BGR colours; shift,
// when not nil, maps each index to another first (the game's item recolouring).
func decodeDC6(b, pal, shift []byte) (*image.NRGBA, error) {
	le := binary.LittleEndian
	if len(b) < 28 {
		return nil, fmt.Errorf("too short")
	}
	dirs, frames := int(le.Uint32(b[16:])), int(le.Uint32(b[20:]))
	if dirs < 1 || frames < 1 || 24+4*dirs*frames > len(b) {
		return nil, fmt.Errorf("no frames")
	}
	at := int(le.Uint32(b[24:]))
	if at+32 > len(b) {
		return nil, fmt.Errorf("bad frame pointer")
	}
	flip, w, h := le.Uint32(b[at:]), int(le.Uint32(b[at+4:])), int(le.Uint32(b[at+8:]))
	length := int(le.Uint32(b[at+28:]))
	data := b[at+32:]
	if length < len(data) {
		data = data[:length]
	}
	if w <= 0 || h <= 0 || w > 512 || h > 512 {
		return nil, fmt.Errorf("odd size %dx%d", w, h)
	}
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	x, y, dy := 0, h-1, -1
	if flip != 0 {
		y, dy = 0, 1
	}
	for i := 0; i < len(data); {
		c := data[i]
		i++
		switch {
		case c == 0x80:
			x, y = 0, y+dy
		case c&0x80 != 0:
			x += int(c & 0x7f)
		default:
			for n := 0; n < int(c) && i < len(data); n++ {
				p := data[i]
				i++
				if shift != nil {
					p = shift[p]
				}
				if x < w && y >= 0 && y < h {
					img.SetNRGBA(x, y, color.NRGBA{R: pal[int(p)*3+2], G: pal[int(p)*3+1], B: pal[int(p)*3], A: 255})
				}
				x++
			}
		}
	}
	return img, nil
}

// PictureFile is the .dc6 base of a picture name ("invhlm.8.5" -> "invhlm").
func PictureFile(name string) string { return strings.SplitN(name, ".", 2)[0] }
