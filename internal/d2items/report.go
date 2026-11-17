package d2items

import "strings"

// ReportItem is an item in the shape the web page's inventory window reads (the same fields the bots report from the game:
// g id, c code, q quality, m mode 0 stored 1 worn 2 belt, l where 1 worn 2 belt 3 inventory 6 cube 7 stash, b body slot, x y place,
// w h size, n name, i item level, k identified, d tooltip text).
type ReportItem struct {
	G int    `json:"g"`
	C string `json:"c"`
	Q int    `json:"q"`
	M int    `json:"m"`
	L int    `json:"l"`
	B int    `json:"b"`
	X int    `json:"x"`
	Y int    `json:"y"`
	W int    `json:"w"`
	H int    `json:"h"`
	N string `json:"n"`
	T int    `json:"t"`
	I int    `json:"i"`
	K int    `json:"k"`
	D string `json:"d,omitempty"`
	F string `json:"f,omitempty"` // its picture (Tables.Picture)
	E bool   `json:"e,omitempty"` // ethereal (the game draws it see-through)
	S int    `json:"s,omitempty"` // sockets
	// the items in its sockets, in order
	Socketed []ReportItem `json:"sk,omitempty"`
}

// Report is a character's items as the inventory window shows them.
type Report struct {
	Gold  int          `json:"gold"`
	Bank  int          `json:"bank"`
	Items []ReportItem `json:"items"`
	Merc  *ReportMerc  `json:"merc"`
	Pages []ReportPage `json:"pages,omitempty"` // PlugY's stash pages, when the character has a .d2x
}

type ReportMerc struct {
	Name  string       `json:"name"`
	Kind  string       `json:"kind"`
	Dead  bool         `json:"dead,omitempty"`
	Items []ReportItem `json:"items"`
	// what his gear adds up to (the user, 2026-11-16: "on the merc page, to the right of the equipment, list the stats on the merc"): the defense of the pieces and every
	// stat of them added up and worded the way the game words it (Describe's tooltip lines). The merc's own base life, damage and level are not read from the save.
	Def   int    `json:"def,omitempty"`
	Stats string `json:"stats,omitempty"`
}

type ReportPage struct {
	Name  string       `json:"name"`
	Items []ReportItem `json:"items"`
}

// BuildReport makes the report of a character from its save (and its PlugY pages, nil when it has none). clvl: the character's level.
func BuildReport(c *Character, pages []StashPage, t *Tables, clvl, gold, bank int) Report {
	rep := Report{Gold: gold, Bank: bank, Items: []ReportItem{}}
	g := 0
	conv := func(it *Item) (ReportItem, bool) {
		g++
		d := Describe(it, t, clvl)
		r := ReportItem{G: g, C: it.Code, Q: it.Quality, B: it.Body, X: it.X, Y: it.Y, N: d.Name, I: it.Level, K: 1, F: t.Picture(it), E: it.Ethereal, S: it.Sockets}
		for _, ch := range it.Children {
			cd := Describe(ch, t, clvl)
			cr := ReportItem{C: ch.Code, Q: ch.Quality, N: cd.Name, W: 1, H: 1, K: 1, F: t.Picture(ch)}
			if cr.Q == 0 {
				cr.Q = 2
			}
			if len(cd.Lines) > 1 {
				cr.D = strings.Join(cd.Lines, "\n")
			}
			r.Socketed = append(r.Socketed, cr)
		}
		if it.Quality == 0 {
			r.Q = 2
		}
		if !it.Simple && !it.Identified {
			r.K = 0
		}
		if b := t.Bases[it.Code]; b != nil {
			r.W, r.H = b.W, b.H
		} else {
			r.W, r.H = 1, 1
		}
		if len(d.Lines) > 1 {
			r.D = strings.Join(d.Lines, "\n")
		}
		switch it.Location {
		case 1:
			r.M, r.L = 1, 1
		case 2:
			r.M, r.L = 2, 2
		case 0:
			switch it.Store {
			case 1:
				r.L = 3
			case 4:
				r.L = 6
			case 5:
				r.L = 7
			default:
				return r, false
			}
		default:
			return r, false // on the cursor: not anywhere to show
		}
		return r, true
	}
	for _, it := range c.Items {
		if len(pages) > 0 && it.Location == 0 && it.Store == 5 {
			continue // PlugY keeps the page shown in the game in the save too: the pages below have it
		}
		if r, ok := conv(it); ok {
			rep.Items = append(rep.Items, r)
		}
	}
	for _, p := range pages {
		rp := ReportPage{Name: p.Name, Items: []ReportItem{}}
		for _, it := range p.Items {
			if r, ok := conv(it); ok {
				rp.Items = append(rp.Items, r)
			}
		}
		rep.Pages = append(rep.Pages, rp)
	}
	if c.MercID != 0 {
		name, kind := t.MercName(c.MercType, c.MercName)
		m := &ReportMerc{Name: name, Kind: kind, Dead: c.MercDead, Items: []ReportItem{}}
		var props []Prop
		for _, it := range c.Merc {
			if r, ok := conv(it); ok {
				m.Items = append(m.Items, r)
			}
			if it.Location == 1 { // worn
				m.Def += it.Defense
				props = append(props, it.Props...)
				props = append(props, it.RunewordProp...)
				for _, ch := range it.Children {
					props = append(props, socketedProps(ch, t)...)
				}
			}
		}
		m.Stats = strings.Join(t.propLines(props, clvl), "\n")
		rep.Merc = m
	}
	return rep
}
