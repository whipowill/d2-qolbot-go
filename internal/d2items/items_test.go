package d2items

import (
	"encoding/binary"
	"strings"
	"testing"
)

type bitWriter struct {
	b   []byte
	pos int
}

func (w *bitWriter) put(v, n int) {
	for i := 0; i < n; i++ {
		if w.pos>>3 >= len(w.b) {
			w.b = append(w.b, 0)
		}
		if v&(1<<uint(i)) != 0 {
			w.b[w.pos>>3] |= 1 << uint(w.pos&7)
		}
		w.pos++
	}
}

func (w *bitWriter) align() { w.pos = (w.pos + 7) &^ 7 }

// a tiny set of tables: a cap (armor) and a gas potion that the mod has made a "misc" type in Weapons.txt
func testTables() *Tables {
	src := func(name string) []byte {
		switch name {
		case "Armor.txt":
			return []byte("name\tcode\tnamestr\tinvwidth\tinvheight\ttype\tstackable\nCap\tcap\tCap\t2\t2\thelm\t\n")
		case "Weapons.txt":
			return []byte("name\tcode\tnamestr\tinvwidth\tinvheight\ttype\tstackable\nRancid Gas Potion\tgps\tgps\t1\t1\tmisc\t\n")
		case "ItemTypes.txt":
			return []byte("ItemType\tCode\tEquiv1\tEquiv2\nArmor\tarmo\t\t\nHelm\thelm\tarmo\t\nWeapon\tweap\t\t\nMisc\tmisc\t\t\n")
		case "ItemStatCost.txt":
			// row order is the stat id; the ID column is ignored (the game does)
			rows := "Stat\tID\tSave Bits\tSave Add\tSave Param Bits\tdescpriority\tdescfunc\tdescval\tdescstrpos\n"
			for i := 0; i < 40; i++ {
				switch i {
				case 0:
					rows += "strength\t999\t8\t32\t\t67\t1\t1\tto Strength\n"
				case 31:
					rows += "armorclass\t31\t11\t10\t\t\t\t\t\n"
				default:
					rows += "x\t\t\t\t\t\t\t\t\n"
				}
			}
			return []byte(rows)
		case "UniqueItems.txt":
			return []byte("index\tcode\nThe Gnasher\thax\nExpansion\t\nBiggin's Bonnet\tcap\n")
		}
		return nil
	}
	return Load(src)
}

func writeHead(w *bitWriter, flags int, code string) {
	w.put('J', 8)
	w.put('M', 8)
	w.put(flags, 32)
	w.put(0, 10)
	w.put(0, 3) // stored
	w.put(0, 4)
	w.put(2, 4) // x
	w.put(1, 4) // y
	w.put(1, 3) // inventory
	for i := 0; i < 4; i++ {
		c := byte(' ')
		if i < len(code) {
			c = code[i]
		}
		w.put(int(c), 8)
	}
	w.put(0, 3)
}

func TestReadList(t *testing.T) {
	tb := testTables()
	w := &bitWriter{}
	w.put('J', 8)
	w.put('M', 8)
	w.put(2, 16)
	// a unique cap: Biggin's Bonnet is unique 1 (the "Expansion" row takes no id), defense 5, durability 10 of 12, +3 strength
	writeHead(w, 1<<4, "cap")
	w.put(12345, 32)
	w.put(7, 7)
	w.put(7, 4) // unique
	w.put(0, 1)
	w.put(0, 1)
	w.put(1, 12)
	w.put(0, 1) // timestamp
	w.put(5+10, 11)
	w.put(12, 8)
	w.put(10, 8)
	w.put(0, 1)
	w.put(0, 9)
	w.put(3+32, 8)
	w.put(0x1ff, 9)
	w.align()
	// the gas potion: a "misc" type, so no durability and no quantity
	writeHead(w, 1<<4, "gps")
	w.put(1, 32)
	w.put(9, 7)
	w.put(2, 4)
	w.put(0, 1)
	w.put(0, 1)
	w.put(0, 1)
	w.put(0x1ff, 9)
	w.align()

	items, end, err := ReadList(w.b, 0, tb)
	if err != nil {
		t.Fatal(err)
	}
	if end != len(w.b) || len(items) != 2 {
		t.Fatalf("read %d items to byte %d of %d", len(items), end, len(w.b))
	}
	cp := items[0]
	if cp.Code != "cap" || cp.UniqueID != 1 || cp.Defense != 5 || cp.MaxDur != 12 || cp.Durability != 10 || cp.X != 2 || cp.Y != 1 || cp.Store != 1 {
		t.Errorf("cap: %+v", cp)
	}
	d := Describe(cp, tb, 1)
	if d.Name != "Biggin's Bonnet Cap" || !strings.Contains(d.Line(), "+3 to Strength") || !strings.Contains(d.Line(), "Defense: 5") {
		t.Errorf("cap described as %q", d.Line())
	}
	if items[1].Code != "gps" || items[1].MaxDur != 0 {
		t.Errorf("potion: %+v", items[1])
	}
}

func TestReadTbl(t *testing.T) {
	// a .tbl with one string: header (21 bytes), one index, one hash entry (17 bytes), then the key and the text
	key, text := "cap", string([]byte{'C', 'a', 'p', 0xc3, 0xbf}) // the colour byte written as UTF-8, as the QOL mod's strings have it
	b := make([]byte, 21+2+17)
	binary.LittleEndian.PutUint16(b[2:], 1)
	binary.LittleEndian.PutUint32(b[4:], 1)
	keyOff := len(b)
	b = append(b, append([]byte(key), 0)...)
	strOff := len(b)
	b = append(b, append([]byte(text), 0)...)
	e := 21 + 2
	b[e] = 1
	binary.LittleEndian.PutUint32(b[e+7:], uint32(keyOff))
	binary.LittleEndian.PutUint32(b[e+11:], uint32(strOff))
	binary.LittleEndian.PutUint16(b[e+15:], uint16(len(text)+1))
	m := map[string]string{}
	readTbl(b, m)
	if m["cap"] != "Capÿ" {
		t.Errorf("got %q", m["cap"])
	}
}
