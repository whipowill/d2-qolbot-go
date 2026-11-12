// The build for this character is chosen by qolbot from its save file (internal/spec) and applied by
// common/AutoSpec.js: template, skill points, stat points, attack skills and auto-equip.
// To force a build for a character, set "spec" on its profile in qolbot.json (e.g. "Hammerdin").
function LoadConfig()
{
	include("common/AutoSpec.js");
	AutoSpec.apply();
}