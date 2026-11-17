package main

// respecButton is where PlugY puts its "Unassign all skills points" button on the skill page, in client pixels of the 640x480 game window.
// PlugY's "Unassign all skills points" button is the X in the top right of the skill page (T), centre (540,73) in the 640x480 window. Measured on the user's
// screenshot (2026-11-13): the game shows the 640x480 window scaled 2.25x and centred in 1920x1080 (240 px bars each side), the X was at (1455,163)
// there, so x=(1455-240)/2.25=540, y=163/2.25=73. The first guess (595,34) was wrong. The square "no entry" icon at the bottom left, (351,402), is the game's own CLOSE button:
// an earlier guess used it by mistake. The click has NOT been tried on a character yet.
var respecButton = [2]int{540, 73}

// statButtons is where PlugY's stat buttons sit on the character screen (C), in client pixels of the 640x480 window, for "str", "dex", "vit", "energy".
// MEASURED 2026-11-13 on the user's screenshot of the character screen (the 640x480 window scaled 2.25x, 240 px side bars; the red plus buttons at screen
// x=637, y=273/384/539/649 -> x=(637-240)/2.25=176, y=121/171/240/288). The click has NOT been tried on a character: whether PlugY takes a posted Alt is unknown. With Alt held a click on the button takes a point
// back (Alt+Shift: ten points, PlugY.ini LimitValueToShiftClick=10).
var statButtons = map[string][2]int{
	"str":    {176, 121},
	"dex":    {176, 171},
	"vit":    {176, 240},
	"energy": {176, 288},
}

// statButtonsKnown: at least one stat button has a measured position (until then the stat part of Auto Respec only judges and reports).
func statButtonsKnown() bool {
	for _, v := range statButtons {
		if v[0] != 0 || v[1] != 0 {
			return true
		}
	}
	return false
}
