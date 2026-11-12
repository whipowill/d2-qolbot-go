# Qolbot for Diablo II

A botting application for Diablo II designed for the singleplayer enthusiast.

This program focuses on botting on your local machine, allowing you to create LAN games that your other singleplayer characters can join. It's like having your own ladder reset where you roll through the game with a full team.

What began as an old version of Kolbot was eventually rewritten in Go to make it run on Linux and Mac in addition to Windows. The UI has been completely redesigned and strips out all the complexity of the old botting system.

This program is built around D2LOD ``v1.13d`` and includes PlugY support.

| | |
|---|---|
| ![Screenshot](https://i.imgur.com/FNm353J.png) | ![Screenshot](https://i.imgur.com/bPrhvVZ.png) |

The beauty of running this on Linux is that I never even see the bot windows at all. It all happens completely in the background on my machine using minimal resources. Each bot I run consumes about 5% of my total CPU.

## Vision

The goal was to create an experience where bots will join your games and play with you and automatically do the things a normal person would do. They crack jokes, gather waypoints, complete quests, gear up, choose skills, gamble, etc.

- Gallows humor remarks as they play
- Capture waypoints as they play
- Pickup quest items as they play
- AutoEquip items as they play
- AutoStat assign stats as they play
- AutoSkill assign skills as they play
- Complete quests as they are able in town
- Infinite stash support for PlugY

![Screenshot](https://i.imgur.com/xJqNewn.png)

## Install

Linux and Mac users will need to install some dependencies:

```
// Linux
$ sudo apt install wine xvfb

// Mac
$ brew tap gcenx/wine && brew install --cask wine-stable
```

Clone this repo and run from the command line:

```
$ git clone https://github.com/whipowill/d2-qolbot-go.git Qolbot
$ cd Qolbot

// Linux
$ ./qolbot

// Mac
$ ./qolbot

// Windows
> qolbot.cmd
```

On Linux or Mac the first run will generate a Wine prefix (stored at ``~/.qolbot_wine_prefix``). This separate and distinct Wine installation is helpful in preventing game interference as you play at the same time.

Open the [web interface](http://127.0.0.1:8080/) from your browser.

## Usage

If you're intending to play with the bots, you simply host a TCP/IP game and instruct the bots from the web interface to ``Start``. If you're not intending to play, you can choose a bot leader and have multiple bots do farming or questing runs.

## Configuration

No editing of files is required and everything is configured in the UI.  The program will ask you to locate the ``Game.exe`` file for Diablo II and will auto detect all your available characters.

Every time you load a bot, the program will determine the spec of that character and build a file with instructions on what future stats, skills, and desirable gear are appropriate for their advancement.

The attempt was to make something really complicated become really simple.

## Known Issues

- PlugY ``World Event`` auto-selling sequence crashes Qolbot

## Credits

Runs on Kolbot by Kolton and D2BS by Noah.

- [Kolbot](https://github.com/kolton/d2bot-with-kolbot/tree/patch-113d-core15) - the original repository from which this program was born

## External Links

- [Will Scarlet's PlugY QOL Modpack](https://github.com/whipowill/d2-plugy-qol) - a compilation of the best quality-of-life mods for the game