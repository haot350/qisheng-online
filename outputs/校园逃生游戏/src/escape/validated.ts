import type {EscapeSite,EscapeVec3} from './types.ts';
export const VALIDATED_ESCAPE_SITES:EscapeSite[]=[
  {
    "id": "yard",
    "label": "教学庭院",
    "region": "teaching",
    "position": [
      -46,
      0.16500002086300264,
      -103
    ],
    "floor": 0
  },
  {
    "id": "teaching-supply",
    "label": "教学区道路",
    "region": "teaching",
    "position": [
      -24,
      0.06700001597542177,
      -100
    ],
    "floor": 0
  },
  {
    "id": "library-west",
    "label": "图书馆西侧",
    "region": "teaching",
    "position": [
      -18,
      0.1550000154955219,
      -106
    ],
    "floor": 0
  },
  {
    "id": "sports-north",
    "label": "运动场北侧",
    "region": "sports",
    "position": [
      -118,
      0.17300000726708892,
      -95
    ],
    "floor": 0
  },
  {
    "id": "sports-road",
    "label": "运动区道路",
    "region": "sports",
    "position": [
      -77,
      0.0749999934434891,
      -78
    ],
    "floor": 0
  },
  {
    "id": "canteen-north",
    "label": "食堂北侧",
    "region": "canteen",
    "position": [
      0,
      -0.01000002086419402,
      -184
    ],
    "floor": 0
  },
  {
    "id": "dorm-road",
    "label": "宿舍东侧道路",
    "region": "dorm",
    "position": [
      82,
      0.0840000116825104,
      -120
    ],
    "floor": 0
  },
  {
    "id": "dorm-yard",
    "label": "宿舍下沉庭院",
    "region": "dorm",
    "position": [
      45,
      -2.3600000000039305,
      -124
    ],
    "floor": 0,
    "roles": [
      "take",
      "deliver"
    ]
  },
  {
    "id": "south-floor-1",
    "label": "南楼一层走廊",
    "region": "teaching",
    "position": [
      -51,
      0.5350000262260437,
      -77.4
    ],
    "floor": 1,
    "roles": [
      "take",
      "activate",
      "deliver"
    ]
  },
  {
    "id": "south-floor-2",
    "label": "南楼二层走廊",
    "region": "teaching",
    "position": [
      -50,
      4.244999847412109,
      -78
    ],
    "floor": 2,
    "roles": [
      "take",
      "activate",
      "deliver"
    ]
  },
  {
    "id": "south-floor-1-west",
    "label": "南楼一层西侧",
    "region": "teaching",
    "position": [
      -64,
      0.5350000262260437,
      -77.4
    ],
    "floor": 1,
    "roles": [
      "activate"
    ]
  },
  {
    "id": "south-floor-2-west",
    "label": "南楼二层西侧",
    "region": "teaching",
    "position": [
      -64,
      4.244999847412109,
      -78
    ],
    "floor": 2,
    "roles": [
      "activate"
    ]
  }
];
export const VALIDATED_ESCAPE_RESPAWN_SITES:EscapeSite[]=[
  {
    "id": "npc-sports-north-west",
    "label": "npc-sports-north-west",
    "region": "sports",
    "floor": 0,
    "position": [
      -145,
      0.12599999994039537,
      -99
    ]
  },
  {
    "id": "npc-sports-south-west",
    "label": "npc-sports-south-west",
    "region": "sports",
    "floor": 0,
    "position": [
      -145,
      0.12599999994039537,
      -153
    ]
  },
  {
    "id": "npc-canteen-north",
    "label": "npc-canteen-north",
    "region": "canteen",
    "floor": 0,
    "position": [
      -25,
      0.0670000070333481,
      -131
    ]
  },
  {
    "id": "npc-canteen-south",
    "label": "npc-canteen-south",
    "region": "canteen",
    "floor": 0,
    "position": [
      -25,
      0.0670000070333481,
      -179
    ]
  },
  {
    "id": "npc-dorm-north",
    "label": "npc-dorm-north",
    "region": "dorm",
    "floor": 0,
    "position": [
      82,
      0.0840000116825104,
      -120
    ]
  },
  {
    "id": "npc-teaching-west",
    "label": "npc-teaching-west",
    "region": "teaching",
    "floor": 0,
    "position": [
      -77,
      0.0749999934434891,
      -78
    ]
  },
  {
    "id": "npc-teaching-east",
    "label": "npc-teaching-east",
    "region": "teaching",
    "floor": 0,
    "position": [
      25,
      0.04300000309944155,
      -98
    ]
  },
  {
    "id": "npc-sports-west-north",
    "label": "npc-sports-west-north",
    "region": "sports",
    "floor": 0,
    "position": [
      -145,
      0.12599999994039537,
      -88
    ]
  },
  {
    "id": "npc-sports-west-south",
    "label": "npc-sports-west-south",
    "region": "sports",
    "floor": 0,
    "position": [
      -145,
      0.12600000739097597,
      -164
    ]
  },
  {
    "id": "npc-canteen-west-upper",
    "label": "npc-canteen-west-upper",
    "region": "canteen",
    "floor": 0,
    "position": [
      -25,
      0.0670000070333481,
      -143
    ]
  },
  {
    "id": "npc-canteen-west-lower",
    "label": "npc-canteen-west-lower",
    "region": "canteen",
    "floor": 0,
    "position": [
      -25,
      0.0670000070333481,
      -167
    ]
  },
  {
    "id": "npc-dorm-upper",
    "label": "npc-dorm-upper",
    "region": "dorm",
    "floor": 0,
    "position": [
      82,
      0.0840000116825104,
      -112
    ]
  },
  {
    "id": "npc-dorm-upper-road",
    "label": "npc-dorm-upper-road",
    "region": "dorm",
    "floor": 0,
    "position": [
      82,
      0.0840000116825104,
      -100
    ]
  },
  {
    "id": "npc-teaching-west-upper",
    "label": "npc-teaching-west-upper",
    "region": "teaching",
    "floor": 0,
    "position": [
      -77,
      0.08499999880790712,
      -66
    ]
  },
  {
    "id": "npc-teaching-east-upper",
    "label": "npc-teaching-east-upper",
    "region": "teaching",
    "floor": 0,
    "position": [
      25,
      0.04300000309944155,
      -86
    ]
  }
];
export const VALIDATED_ESCAPE_SPAWN:EscapeVec3=[0,0.05799999773502626,-15];
export const VALIDATED_ESCAPE_EXTRACTION:EscapeSite={"id":"gate-extraction","label":"校门撤离点","region":"gate","position":[0,0.05799999773502626,-15],"floor":0};
export const VALIDATED_ESCAPE_EDGES:[string,string,number][]=[["gate-extraction","dorm-road",144.79017984548216],["dorm-road","gate-extraction",145.07640322798147],["gate-extraction","sports-road",101.04774751284798],["sports-road","gate-extraction",101.0612283833413],["yard","teaching-supply",23.267638562026207],["yard","library-west",28.16025745619019],["yard","sports-north",79.10742948644926],["yard","sports-road",41.08868518336962],["yard","dorm-road",144.3481426798366],["yard","dorm-yard",133.10729859922657],["yard","south-floor-1",40.0138476130674],["yard","south-floor-2",58.119513821671084],["yard","south-floor-1-west",31.999320455495603],["yard","south-floor-2-west",44.32642898611158],["teaching-supply","yard",23.267638562026207],["teaching-supply","library-west",8.485737682158605],["teaching-supply","sports-north",99.06693910534722],["teaching-supply","sports-road",58.828055261231185],["teaching-supply","canteen-north",97.21958892466151],["teaching-supply","dorm-road",124.88494371138799],["teaching-supply","dorm-yard",113.64409963077797],["teaching-supply","south-floor-1",56.82634507330319],["teaching-supply","south-floor-2",74.93489270597924],["teaching-supply","south-floor-1-west",48.787487375683],["teaching-supply","south-floor-2-west",61.117477330371344],["library-west","yard",28.16025745619019],["library-west","teaching-supply",8.485737682158605],["library-west","sports-north",107.03297920238666],["library-west","sports-road",66.79563114927703],["library-west","canteen-north",90.90944257267435],["library-west","dorm-road",131.12923076919938],["library-west","dorm-yard",117.4791207848723],["library-west","south-floor-1",64.88993503708207],["library-west","south-floor-2",82.99848266975812],["library-west","south-floor-1-west",56.87540787951027],["library-west","south-floor-2-west",69.20539783419862],["sports-north","yard",79.10742948644925],["sports-north","teaching-supply",96.84679956431083],["sports-north","library-west",104.81437545235666],["sports-north","sports-road",44.384790232850044],["sports-north","dorm-road",210.9966856011493],["sports-north","dorm-yard",199.7558415205392],["sports-north","south-floor-1",70.24405064615793],["sports-north","south-floor-2",87.31847175751302],["sports-north","south-floor-1-west",61.62635216804031],["sports-north","south-floor-2-west",73.52538692195353],["sports-road","yard",41.08868518336963],["sports-road","teaching-supply",58.828055261231185],["sports-road","library-west",66.79563114927703],["sports-road","sports-north",44.384790232850044],["sports-road","canteen-north",143.09347007873174],["sports-road","dorm-road",172.71818869341263],["sports-road","dorm-yard",161.47734461280257],["sports-road","south-floor-1",31.202251648986348],["sports-road","south-floor-2",48.27667276034145],["sports-road","south-floor-1-west",22.584553170868723],["sports-road","south-floor-2-west",34.48358792478194],["canteen-north","yard",102.01216972902827],["canteen-north","teaching-supply",97.21958892466151],["canteen-north","library-west",90.90944257267435],["canteen-north","sports-north",150.54272363919716],["canteen-north","sports-road",143.09347007873174],["canteen-north","south-floor-1",145.97352241849802],["canteen-north","south-floor-2",164.08207005117407],["canteen-north","south-floor-1-west",134.0041053508577],["canteen-north","south-floor-2-west",146.33121388147367],["dorm-road","teaching-supply",124.88189137467305],["dorm-road","library-west",128.72680523209343],["dorm-road","sports-north",210.99363326443432],["dorm-road","sports-road",178.18848608841324],["dorm-road","canteen-north",109.42978985715],["dorm-road","dorm-yard",50.88695308194645],["dorm-road","south-floor-1",170.23213717049424],["dorm-road","south-floor-2",188.3406848031703],["dorm-road","south-floor-1-west",162.21761001292248],["dorm-road","south-floor-2-west",174.5475999676108],["dorm-yard","teaching-supply",113.6440996307779],["dorm-yard","library-west",117.48901348819828],["dorm-yard","sports-north",199.7558415205392],["dorm-yard","sports-road",166.95069434451813],["dorm-yard","canteen-north",92.1399149302145],["dorm-yard","dorm-road",50.89000541866142],["dorm-yard","south-floor-1",158.99434542659912],["dorm-yard","south-floor-2",177.10289305927517],["dorm-yard","south-floor-1-west",150.97981826902736],["dorm-yard","south-floor-2-west",163.3098082237157],["south-floor-1","yard",40.0138476130674],["south-floor-1","teaching-supply",56.802014533254805],["south-floor-1","library-west",64.88993503708207],["south-floor-1","sports-north",70.24405064615793],["south-floor-1","sports-road",31.202251648986344],["south-floor-1","dorm-road",170.2351895072092],["south-floor-1","dorm-yard",158.99434542659912],["south-floor-1","south-floor-2",39.57348784548225],["south-floor-1","south-floor-1-west",13],["south-floor-1","south-floor-2-west",28.17907938861439],["south-floor-2","yard",58.119513821671084],["south-floor-2","teaching-supply",74.91056216593086],["south-floor-2","library-west",82.99848266975813],["south-floor-2","sports-north",87.31847175751304],["south-floor-2","sports-road",48.27667276034145],["south-floor-2","dorm-road",188.34373713988526],["south-floor-2","dorm-yard",177.10289305927517],["south-floor-2","south-floor-1",39.57347831253718],["south-floor-2","south-floor-1-west",29.748623744414335],["south-floor-2","south-floor-2-west",14],["south-floor-1-west","yard",31.999320455495603],["south-floor-1-west","teaching-supply",48.787487375683],["south-floor-1-west","library-west",56.87540787951028],["south-floor-1-west","sports-north",61.62635216804031],["south-floor-1-west","sports-road",22.584553170868723],["south-floor-1-west","canteen-north",134.00410535085774],["south-floor-1-west","dorm-road",162.2206623496374],["south-floor-1-west","dorm-yard",150.97981826902733],["south-floor-1-west","south-floor-1",13],["south-floor-1-west","south-floor-2",29.74862374441433],["south-floor-1-west","south-floor-2-west",15.955538908854829],["south-floor-2-west","yard",44.32642898611157],["south-floor-2-west","teaching-supply",61.117477330371344],["south-floor-2-west","library-west",69.20539783419862],["south-floor-2-west","sports-north",73.52538692195353],["south-floor-2-west","sports-road",34.48358792478194],["south-floor-2-west","dorm-road",174.55065230432575],["south-floor-2-west","dorm-yard",163.30980822371566],["south-floor-2-west","south-floor-1",28.179079388614387],["south-floor-2-west","south-floor-2",14],["south-floor-2-west","south-floor-1-west",15.955538908854827],["gate-extraction","south-floor-2",146.12345787474152],["south-floor-2","gate-extraction",146.12345787474158],["teaching-supply","gate-extraction",93.60146959211511],["gate-extraction","teaching-supply",93.60146959211511],["sports-north","gate-extraction",143.3267024140327],["gate-extraction","sports-north",142.76599388704346],["yard","gate-extraction",104.72487562018436],["gate-extraction","yard",104.72487562018436],["gate-extraction","canteen-north",190.64153517133303],["canteen-north","gate-extraction",190.54104010867826],["south-floor-2-west","gate-extraction",132.33037303918206],["gate-extraction","south-floor-2-west",132.9481220836496],["south-floor-1","gate-extraction",128.01491024206553],["gate-extraction","south-floor-1",128.63265928653308],["gate-extraction","library-west",99.71160793587744],["library-west","gate-extraction",99.71160793587744],["dorm-yard","gate-extraction",132.79197025920948],["gate-extraction","dorm-yard",132.79197025920953],["gate-extraction","south-floor-1-west",120.61813212896128],["south-floor-1-west","gate-extraction",120.00038308449372]];
