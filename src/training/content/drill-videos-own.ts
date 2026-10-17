import type { Video } from '../types';

// Videos found for the drills that had none (night 17./18.10.2026): searched on YouTube for the drill itself, each one
// checked with YouTube oEmbed (online, embeddable, real title and channel). German ones where there is a good one.

export const DRILL_OWN_VIDEOS: Record<string, Video[]> = {
  "one-hand": [
    { id: "VnNjaVTz1F0", title: "Golf Training Putt: Einhändig putten", channel: "Golf.de", lang: "de" },
    { id: "z8i0WfupHTo", title: "Control your dominant hand for more putting stability 👋", channel: "Titleist UK & Ireland", lang: "en" },
  ],
  "flop-shot": [
    { id: "Z_ehT2nsZSk", title: "Tiger Woods How to Hit a Flop Shot Over Trouble", channel: "TaylorMade Golf", lang: "en" },
    { id: "MU71wiLkjMM", title: "How Rory McIlroy hits a flop shot", channel: "Golf Channel", lang: "en" },
  ],
  "bump-or-pitch": [
    { id: "DLbq1SQA_6k", title: "Chip Shot vs. Pitch Shot with Brad Faxon", channel: "Titleist", lang: "en" },
    { id: "zXxxXR22IlU", title: "Rory McIlroy – How to Play a Bump & Run Chip Shot", channel: "TaylorMade Golf", lang: "en" },
  ],
  "low-spinner": [
    { id: "6LSrGBjAJyY", title: "How to Hit the Low Spinning Pitch Shot", channel: "Titleist", lang: "en" },
    { id: "x1SpqQE__Fg", title: "Titleist Brand Ambassador Jordan Spieth – 50 Yard Low Check Spinner", channel: "Titleist UK & Ireland", lang: "en" },
  ],
  "fried-egg": [
    { id: "rCVmV_l2De4", title: "Spiegelei – Spezialschlag im Bunker: Der eingebohrte Ball", channel: "GOLFSTUN.DE", lang: "de" },
    { id: "6asVs8tq8Pw", title: "Hank Haney's Tips on the Fried-Egg Lie-Bunker Play-Golf Digest", channel: "Golf Digest", lang: "en" },
  ],
  "bunker-slopes": [
    { id: "BY0s45Oql8s", title: "Golf Bunker: Hanglage im Bunker", channel: "Golf spielen macht süchtig", lang: "de" },
    { id: "KsRB4ryxYNk", title: "Bunker Hanglage", channel: "PaulDyerGolf", lang: "de" },
  ],
  "fairway-bunker": [
    { id: "6dCgbybEUFs", title: "Technik Fairwaybunker – So gelingt Dir der lange Schlag aus dem Bunker", channel: "GOLFSTUN.DE", lang: "de" },
    { id: "H_CVaGuScAM", title: "Rory McIlroy's Fairway Bunker Tips", channel: "TaylorMade Golf", lang: "en" },
  ],
  "rough-reading": [
    { id: "YSSsj4ILmDY", title: "How To Hit Out Of The Rough (Escape Every Time)", channel: "Giles Gill Golf", lang: "en" },
    { id: "mKUtEnZ_EZg", title: "HOW TO HIT A GOLF BALL OUT OF THICK ROUGH: 3 EASY TIPS!", channel: "Scratch Golf Academy", lang: "en" },
  ],
  "divot-lie": [
    { id: "H8ZImKgah1c", title: "How to hit out of divots – Chris Ryan – Today's Golfer", channel: "Today's Golfer", lang: "en" },
    { id: "6e0TdFepwMY", title: "How to play from a divot in the fairway", channel: "Golf.com", lang: "en" },
  ],
  "backhand": [
    { id: "wrs4GbSi8fs", title: "Backhand Hitting Out of Trees", channel: "Monash Golf Academy", lang: "en" },
  ],
  "bare-lie": [
    { id: "NdNoFPiJxmw", title: "How to Hit Golf Shots from a TIGHT LIE – Bare Lie", channel: "Golf Distillery", lang: "en" },
    { id: "May2431xni8", title: "Hale Irwin explains how to chip from tight lies", channel: "Golf Channel", lang: "en" },
  ],
  "over-tree": [
    { id: "LAeSf2QAtDk", title: "How to Hit a HIGH GOLF SHOT OVER TREES", channel: "Golf Distillery", lang: "en" },
    { id: "MzihZ79OK-k", title: "How to Hit a High Shot Over a Tree", channel: "mygolfinstructor", lang: "en" },
  ],
  "gapping": [
    { id: "rcAiZ0-tfBI", title: "How to properly gap your golf equipment", channel: "GOLFTEC", lang: "en" },
    { id: "hlzuEkBzCgc", title: "Rick Shiels' full bag gapping session! (every club distances)", channel: "H.I.T GOLF", lang: "en" },
  ],
  "lead-arm-only": [
    { id: "6LIkdE2aVXo", title: "The Left Arm Only Golf Drill!", channel: "Dan Martin Golf", lang: "en" },
    { id: "azhZegWqOqE", title: "The One-Hand Drill Every Golfer Should Know", channel: "Lower My Handicap", lang: "en" },
  ],
  "stock-shot": [
    { id: "cQuyKfbM7ws", title: "Develop A Stock Shot to Rely on Under Pressure", channel: "GolfersRx", lang: "en" },
    { id: "NdhkV-4uW80", title: "Golf Course Management 101 – Play One Shot Shape", channel: "Wicked Smart Golf", lang: "en" },
  ],
  "wood-off-tee": [
    { id: "MTGcoLLa9vU", title: "Simplify Your Strategy Off the Tee", channel: "Titleist", lang: "en" },
    { id: "CC9ckX2cD_E", title: "Driver vs 3-Wood – Should you Use your 3-Wood Instead of your Driver from the Tee?", channel: "Golf Distillery", lang: "en" },
  ],
  "wood-tee-shot": [
    { id: "pZcw9RhXnZs", title: "HOW TO TEE OFF WITH A 3 WOOD", channel: "Mark Crossfield", lang: "en" },
    { id: "CC9ckX2cD_E", title: "Driver vs 3-Wood – Should you Use your 3-Wood Instead of your Driver from the Tee?", channel: "Golf Distillery", lang: "en" },
  ],
  "driver-face-gate": [
    { id: "NEvY9R18lb8", title: "Tee Gate Drill", channel: "The Golf Coaches", lang: "en" },
    { id: "s4HFHsQeqwc", title: "How To Hit The Center Of The Face EVERY TIME || 3 Driver Checkpoints", channel: "Porzak Golf", lang: "en" },
  ],
  "speed-training": [
    { id: "YEpxjQvGwoE", title: "Overspeedtraining – Endlich weiter schlagen!", channel: "GOLFSTUN.DE", lang: "de" },
    { id: "IQ2UGfjUPuw", title: "SuperSpeed Golf – Overspeed Traning Level 1", channel: "SuperSpeed Golf", lang: "en" },
  ],
  "tee-side": [
    { id: "evkAYO59eD4", title: "How Pros Pick Where To Tee Up Their Ball", channel: "Golf Digest", lang: "en" },
    { id: "KMc290JDXLc", title: "GOLF TEE BOX TIPS: MAKE GOLF EASIER BY TEEING UP TO SUIT YOUR GAME", channel: "The Art of Simple Golf", lang: "en" },
  ],
  "driver-start-gate": [
    { id: "Q8Y44h_MKx0", title: "Improve Your Aim with these Alignment Stick Drills", channel: "Titleist", lang: "en" },
    { id: "VgpX4StL6tU", title: "GET YOUR BALL ON LINE – Start Line Drill with Ryan Rastall", channel: "Golfshake.com", lang: "en" },
  ],
  "hip-stick": [
    { id: "6dN5cj_AB8I", title: "Hip Sway = Consistency Killer... Simple 1 Drill Fix", channel: "Top Speed Golf - Clay Ballard", lang: "en" },
    { id: "iadwSME_20Y", title: "This Drill Will Fix Your Sway IN MINUTES!", channel: "Lewis Sparrow Golf", lang: "en" },
  ],
  "slow-motion": [
    { id: "3fqF2ijBzJE", title: "Harvey Penick Secrets Practice in Slow Motion", channel: "GolfSwing", lang: "en" },
  ],
  "l-to-l": [
    { id: "9sPQE5NWH5I", title: "The L to L Drill Is Your Full Swing", channel: "Malaska Golf", lang: "en" },
    { id: "JDahyN4CT44", title: "What No One Teaches You About L to L (Golf's Best Drill?)", channel: "Malaska Golf", lang: "en" },
  ],
  "video-self": [
    { id: "D0hXysliB4c", title: "How to Record Your Golf Swing Using a Smartphone", channel: "Golf Galaxy", lang: "en" },
    { id: "UByUhnO0e8k", title: "How To Film Your Golf Swing", channel: "Rob Cheney Golf", lang: "en" },
  ],
  "shank-tee": [
    { id: "EubxU2vLM2s", title: "Butch Harmon on How To Fix The Shanks", channel: "Golf Digest", lang: "en" },
    { id: "wyKq6vnewI0", title: "How to Stop SHANKING Irons (2 minute fix)", channel: "Kerrod Gray Golf", lang: "en" },
  ],
  "nine-shot": [
    { id: "q0mj9Adz0Jw", title: "Tiger Woods' Nine Windows", channel: "TaylorMade Golf", lang: "en" },
  ],
  "fade-on-purpose": [
    { id: "nnaSHx9Vpxs", title: "How to Hit a Golf Fade", channel: "Titleist", lang: "en" },
    { id: "A3sgWFivn7I", title: "Bernhard Langer explaining how to Draw and Fade the golf ball", channel: "UAE Golf Online", lang: "en" },
  ],
  "glute-bridge": [
    { id: "I6SoeJ53Uv8", title: "Exercises To Activate & Strengthen Your Glutes", channel: "Golf Digest", lang: "en" },
    { id: "4Zdnuv8QSJw", title: "Glute Exercises for Golfers: Bridge Progression", channel: "18STRONG", lang: "en" },
  ],
  "pallof-press": [
    { id: "7vkITJGxq_I", title: "How to Perform a Golf Pallof Press", channel: "Sam Vickers Golf Performance", lang: "en" },
  ],
  "med-ball-throw": [
    { id: "-K3j9UWGWlA", title: "Rotational Medicine Ball Throw", channel: "Michael Carroll", lang: "en" },
    { id: "jvn3h-63AsA", title: "Top 3 Medicine Ball Exercises for Golf", channel: "Sam Vickers Golf Performance", lang: "en" },
  ],
  "single-leg-balance": [
    { id: "gcYtDRj3mNk", title: "3 Drills to Improve Balance in Golf", channel: "Scratch Golf Academy", lang: "en" },
    { id: "TJ6TgSFQmeo", title: "How to Perform a Single Leg Balance Forward & Side Reach", channel: "Sam Vickers Golf Performance", lang: "en" },
  ],
  "wrist-forearm": [
    { id: "zB0Wz7aHeT0", title: "Wrist Exercises for Golf", channel: "Long Drive Fitness", lang: "en" },
    { id: "F0MI6tV3zHQ", title: "WRIST exercises all golfers must do", channel: "Tyler “tpgolffitness” Parsons", lang: "en" },
  ],
  "practice-swing-match": [
    { id: "OL3IZvTg9jU", title: "1 Genius Hack to Make Your Practice Swing Match Your Real Swing", channel: "US GOLF TV", lang: "en" },
    { id: "yOdaYR3mjko", title: "PRACTICE SWING VS ACTUAL SWING", channel: "Meandmygolf", lang: "en" },
  ],
  "skills-test": [
    { id: "-5NzUqqcBYw", title: "SHORT GAME SKILLS TEST", channel: "Jason Banting Golf Coach", lang: "en" },
    { id: "aFltZ1OF1bc", title: "Short Game Skills Tests And Drills – Sam Goulden Golf", channel: "Sam Goulden Golf", lang: "en" },
  ],
  "two-club-wind": [
    { id: "LVZZ7iv36to", title: "Playing Golf in the Wind", channel: "Titleist", lang: "en" },
    { id: "N2CZvriWjZU", title: "How to Select the Right Club in the Wind", channel: "Andrew Rice", lang: "en" },
  ],
  "worst-ball": [
    { id: "XM_7zsq2ttk", title: "Zach Johnson plays 'worst ball'", channel: "PGA Tour", lang: "en" },
  ],
  "ten-second": [
    { id: "7fPrrTZR1Ko", title: "Golf MENTAL Umgang mit Fehlschlägen", channel: "Stefan Kloppe", lang: "de" },
    { id: "IS5J4MT-jrM", title: "The Best (and worst) Things To Do After You Hit a Bad Shot", channel: "Golf Digest", lang: "en" },
  ],
  "reset-word": [
    { id: "7fPrrTZR1Ko", title: "Golf MENTAL Umgang mit Fehlschlägen", channel: "Stefan Kloppe", lang: "de" },
    { id: "20pF-AiUfZk", title: "9 Mental Techniques Guaranteed to Improve Your Golf Game", channel: "Jon Sherman Golf", lang: "en" },
  ],
  "process-score": [
    { id: "SY1vZO0CMGs", title: "Golf mental: Fokus auf das WIE und den Schlag statt auf den Score", channel: "Antje Heimsoeth", lang: "de" },
    { id: "tD3gre1a-y4", title: "Golf Psychology Tips – Understanding Process v Outcome, Golf Mental Game Lesson, Part 1", channel: "Scratch At 50 Press Conferences", lang: "en" },
  ],
  "round-journal": [
    { id: "J3g9G7xEYNk", title: "Discover the Benefits of Using a Golf Journal!", channel: "The Silent Golfer", lang: "en" },
    { id: "MzIKiy4RC34", title: "Is this the best way to track your golf? – JOURNAL 18 OVERVIEW", channel: "Made for the Range Golf", lang: "en" },
  ],
  "stats-round": [
    { id: "rpiJvNXwW1Y", title: "Golf Statistics You Should Be Tracking", channel: "Titleist", lang: "en" },
    { id: "GrTP-ZLHrKM", title: "Do you keep stats when you play golf? Here’s why you should.", channel: "Golf Distillery", lang: "en" },
  ],
  "cross-arms-turn": [
    { id: "mQwDv_vsWdA", title: "2 Drills for The Correct Shoulder Turn in Golf!", channel: "Scratch Golf Academy", lang: "en" },
    { id: "93B--sQCHwM", title: "3 Stretches for More Shoulder Turn in Your Golf Swing!", channel: "HansenFitnessForGolf", lang: "en" },
  ],
};
