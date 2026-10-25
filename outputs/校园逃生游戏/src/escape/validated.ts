// Anonymous example geometry. Formal campus calibration is distributed separately.
import type {EscapeSite,EscapeVec3} from './types.ts';
export const VALIDATED_ESCAPE_MAP_CATALOG_ID="hf-r02-web-1";
export const VALIDATED_ESCAPE_SITES:EscapeSite[]=[
  {
    "id": "yard",
    "label": "示例地点 1",
    "region": "teaching",
    "position": [
      -15.75,
      0,
      -16
    ],
    "floor": 0
  },
  {
    "id": "teaching-supply",
    "label": "示例地点 2",
    "region": "teaching",
    "position": [
      -7.75,
      0,
      -16
    ],
    "floor": 0
  },
  {
    "id": "library-west",
    "label": "示例地点 3",
    "region": "teaching",
    "position": [
      0.25,
      0,
      -16
    ],
    "floor": 0
  },
  {
    "id": "sports-north",
    "label": "示例地点 4",
    "region": "sports",
    "position": [
      8.25,
      0,
      -16
    ],
    "floor": 0
  },
  {
    "id": "sports-road",
    "label": "示例地点 5",
    "region": "sports",
    "position": [
      16.25,
      0,
      -16
    ],
    "floor": 0
  },
  {
    "id": "south-floor-1",
    "label": "示例地点 6",
    "region": "teaching",
    "position": [
      -15.75,
      3.8,
      -8
    ],
    "floor": 1,
    "roles": [
      "take",
      "activate",
      "deliver"
    ],
    "levelId": "south-f1",
    "buildingId": "south-teaching"
  },
  {
    "id": "south-floor-2",
    "label": "示例地点 7",
    "region": "teaching",
    "position": [
      -7.75,
      7.6,
      -8
    ],
    "floor": 2,
    "roles": [
      "take",
      "activate",
      "deliver"
    ],
    "levelId": "south-f2",
    "buildingId": "south-teaching"
  },
  {
    "id": "south-floor-1-west",
    "label": "示例地点 8",
    "region": "teaching",
    "position": [
      0.25,
      3.8,
      -8
    ],
    "floor": 1,
    "roles": [
      "activate"
    ],
    "levelId": "south-f1",
    "buildingId": "south-teaching"
  },
  {
    "id": "south-floor-2-west",
    "label": "示例地点 9",
    "region": "teaching",
    "position": [
      8.25,
      7.6,
      -8
    ],
    "floor": 2,
    "roles": [
      "activate"
    ],
    "levelId": "south-f2",
    "buildingId": "south-teaching"
  },
  {
    "id": "hf-middle-f1",
    "label": "示例地点 10",
    "region": "teaching",
    "position": [
      16.25,
      3.8,
      -8
    ],
    "floor": 1,
    "levelId": "middle-f1",
    "buildingId": "middle-teaching",
    "roles": [
      "take",
      "deliver"
    ]
  }
];
export const VALIDATED_ESCAPE_RESPAWN_SITES:EscapeSite[]=[
  {
    "id": "npc-sports-north-west",
    "label": "示例地点 1",
    "region": "sports",
    "floor": 0,
    "position": [
      -16,
      0,
      -16
    ]
  },
  {
    "id": "npc-sports-south-west",
    "label": "示例地点 2",
    "region": "sports",
    "floor": 0,
    "position": [
      -8,
      0,
      -16
    ]
  },
  {
    "id": "npc-canteen-north",
    "label": "示例地点 3",
    "region": "canteen",
    "floor": 0,
    "position": [
      0,
      0,
      -16
    ]
  },
  {
    "id": "npc-canteen-south",
    "label": "示例地点 4",
    "region": "canteen",
    "floor": 0,
    "position": [
      8,
      0,
      -16
    ]
  },
  {
    "id": "npc-teaching-west",
    "label": "示例地点 5",
    "region": "teaching",
    "floor": 0,
    "position": [
      16,
      0,
      -16
    ]
  },
  {
    "id": "npc-teaching-east",
    "label": "示例地点 6",
    "region": "teaching",
    "floor": 0,
    "position": [
      -16,
      0,
      -8
    ]
  },
  {
    "id": "npc-sports-west-north",
    "label": "示例地点 7",
    "region": "sports",
    "floor": 0,
    "position": [
      -8,
      0,
      -8
    ]
  },
  {
    "id": "npc-sports-west-south",
    "label": "示例地点 8",
    "region": "sports",
    "floor": 0,
    "position": [
      0,
      0,
      -8
    ]
  },
  {
    "id": "npc-canteen-west-upper",
    "label": "示例地点 9",
    "region": "canteen",
    "floor": 0,
    "position": [
      8,
      0,
      -8
    ]
  },
  {
    "id": "npc-canteen-west-lower",
    "label": "示例地点 10",
    "region": "canteen",
    "floor": 0,
    "position": [
      16,
      0,
      -8
    ]
  },
  {
    "id": "npc-dorm-upper",
    "label": "示例地点 11",
    "region": "dorm",
    "floor": 0,
    "position": [
      -16,
      0,
      0
    ]
  },
  {
    "id": "npc-dorm-upper-road",
    "label": "示例地点 12",
    "region": "dorm",
    "floor": 0,
    "position": [
      -8,
      0,
      0
    ]
  },
  {
    "id": "npc-teaching-west-upper",
    "label": "示例地点 13",
    "region": "teaching",
    "floor": 0,
    "position": [
      0,
      0,
      0
    ]
  },
  {
    "id": "npc-teaching-east-upper",
    "label": "示例地点 14",
    "region": "teaching",
    "floor": 0,
    "position": [
      8,
      0,
      0
    ]
  }
];
export const VALIDATED_ESCAPE_SPAWN:EscapeVec3=[
  0,
  0,
  0
];
export const VALIDATED_ESCAPE_EXTRACTION:EscapeSite={
  "id": "gate-extraction",
  "label": "示例撤离点",
  "region": "gate",
  "position": [
    0,
    0,
    0
  ],
  "floor": 0
};
export const VALIDATED_ESCAPE_EDGES:[string,string,number][]=[
  [
    "gate-extraction",
    "yard",
    22.45133626312697
  ],
  [
    "gate-extraction",
    "teaching-supply",
    17.778146697561027
  ],
  [
    "gate-extraction",
    "library-west",
    16.00195300580526
  ],
  [
    "gate-extraction",
    "sports-north",
    18.001736027394692
  ],
  [
    "gate-extraction",
    "sports-road",
    22.804878863962422
  ],
  [
    "gate-extraction",
    "south-floor-1",
    18.069380177526842
  ],
  [
    "gate-extraction",
    "south-floor-2",
    13.48415737078146
  ],
  [
    "gate-extraction",
    "south-floor-1-west",
    8.860163655373416
  ],
  [
    "gate-extraction",
    "south-floor-2-west",
    13.777608645915299
  ],
  [
    "gate-extraction",
    "hf-middle-f1",
    18.506823066101862
  ],
  [
    "yard",
    "gate-extraction",
    22.45133626312697
  ],
  [
    "yard",
    "teaching-supply",
    8
  ],
  [
    "yard",
    "library-west",
    16
  ],
  [
    "yard",
    "sports-north",
    24
  ],
  [
    "yard",
    "sports-road",
    32
  ],
  [
    "yard",
    "south-floor-1",
    8.85663593019381
  ],
  [
    "yard",
    "south-floor-2",
    13.629380029920656
  ],
  [
    "yard",
    "south-floor-1-west",
    18.287700784953806
  ],
  [
    "yard",
    "south-floor-2-west",
    26.41514716975849
  ],
  [
    "yard",
    "hf-middle-f1",
    33.20301191157212
  ],
  [
    "teaching-supply",
    "gate-extraction",
    17.778146697561027
  ],
  [
    "teaching-supply",
    "yard",
    8
  ],
  [
    "teaching-supply",
    "library-west",
    8
  ],
  [
    "teaching-supply",
    "sports-north",
    16
  ],
  [
    "teaching-supply",
    "sports-road",
    24
  ],
  [
    "teaching-supply",
    "south-floor-1",
    11.934822998268555
  ],
  [
    "teaching-supply",
    "south-floor-2",
    11.034491379306976
  ],
  [
    "teaching-supply",
    "south-floor-1-west",
    11.934822998268555
  ],
  [
    "teaching-supply",
    "south-floor-2-west",
    19.436048981210146
  ],
  [
    "teaching-supply",
    "hf-middle-f1",
    25.582024939398366
  ],
  [
    "library-west",
    "gate-extraction",
    16.00195300580526
  ],
  [
    "library-west",
    "yard",
    16
  ],
  [
    "library-west",
    "teaching-supply",
    8
  ],
  [
    "library-west",
    "sports-north",
    8
  ],
  [
    "library-west",
    "sports-road",
    16
  ],
  [
    "library-west",
    "south-floor-1",
    18.287700784953806
  ],
  [
    "library-west",
    "south-floor-2",
    13.629380029920656
  ],
  [
    "library-west",
    "south-floor-1-west",
    8.85663593019381
  ],
  [
    "library-west",
    "south-floor-2-west",
    13.629380029920656
  ],
  [
    "library-west",
    "hf-middle-f1",
    18.287700784953806
  ],
  [
    "sports-north",
    "gate-extraction",
    18.001736027394692
  ],
  [
    "sports-north",
    "yard",
    24
  ],
  [
    "sports-north",
    "teaching-supply",
    16
  ],
  [
    "sports-north",
    "library-west",
    8
  ],
  [
    "sports-north",
    "sports-road",
    8
  ],
  [
    "sports-north",
    "south-floor-1",
    25.582024939398366
  ],
  [
    "sports-north",
    "south-floor-2",
    19.436048981210146
  ],
  [
    "sports-north",
    "south-floor-1-west",
    11.934822998268555
  ],
  [
    "sports-north",
    "south-floor-2-west",
    11.034491379306976
  ],
  [
    "sports-north",
    "hf-middle-f1",
    11.934822998268555
  ],
  [
    "sports-road",
    "gate-extraction",
    22.804878863962422
  ],
  [
    "sports-road",
    "yard",
    32
  ],
  [
    "sports-road",
    "teaching-supply",
    24
  ],
  [
    "sports-road",
    "library-west",
    16
  ],
  [
    "sports-road",
    "sports-north",
    8
  ],
  [
    "sports-road",
    "south-floor-1",
    33.20301191157212
  ],
  [
    "sports-road",
    "south-floor-2",
    26.41514716975849
  ],
  [
    "sports-road",
    "south-floor-1-west",
    18.287700784953806
  ],
  [
    "sports-road",
    "south-floor-2-west",
    13.629380029920656
  ],
  [
    "sports-road",
    "hf-middle-f1",
    8.85663593019381
  ],
  [
    "south-floor-1",
    "gate-extraction",
    18.069380177526842
  ],
  [
    "south-floor-1",
    "yard",
    8.85663593019381
  ],
  [
    "south-floor-1",
    "teaching-supply",
    11.934822998268555
  ],
  [
    "south-floor-1",
    "library-west",
    18.287700784953806
  ],
  [
    "south-floor-1",
    "sports-north",
    25.582024939398366
  ],
  [
    "south-floor-1",
    "sports-road",
    33.20301191157212
  ],
  [
    "south-floor-1",
    "south-floor-2",
    8.85663593019381
  ],
  [
    "south-floor-1",
    "south-floor-1-west",
    16
  ],
  [
    "south-floor-1",
    "south-floor-2-west",
    24.29897117163605
  ],
  [
    "south-floor-1",
    "hf-middle-f1",
    32
  ],
  [
    "south-floor-2",
    "gate-extraction",
    13.48415737078146
  ],
  [
    "south-floor-2",
    "yard",
    13.629380029920656
  ],
  [
    "south-floor-2",
    "teaching-supply",
    11.034491379306976
  ],
  [
    "south-floor-2",
    "library-west",
    13.629380029920656
  ],
  [
    "south-floor-2",
    "sports-north",
    19.436048981210146
  ],
  [
    "south-floor-2",
    "sports-road",
    26.41514716975849
  ],
  [
    "south-floor-2",
    "south-floor-1",
    8.85663593019381
  ],
  [
    "south-floor-2",
    "south-floor-1-west",
    8.85663593019381
  ],
  [
    "south-floor-2",
    "south-floor-2-west",
    16
  ],
  [
    "south-floor-2",
    "hf-middle-f1",
    24.29897117163605
  ],
  [
    "south-floor-1-west",
    "gate-extraction",
    8.860163655373416
  ],
  [
    "south-floor-1-west",
    "yard",
    18.287700784953806
  ],
  [
    "south-floor-1-west",
    "teaching-supply",
    11.934822998268555
  ],
  [
    "south-floor-1-west",
    "library-west",
    8.85663593019381
  ],
  [
    "south-floor-1-west",
    "sports-north",
    11.934822998268555
  ],
  [
    "south-floor-1-west",
    "sports-road",
    18.287700784953806
  ],
  [
    "south-floor-1-west",
    "south-floor-1",
    16
  ],
  [
    "south-floor-1-west",
    "south-floor-2",
    8.85663593019381
  ],
  [
    "south-floor-1-west",
    "south-floor-2-west",
    8.85663593019381
  ],
  [
    "south-floor-1-west",
    "hf-middle-f1",
    16
  ],
  [
    "south-floor-2-west",
    "gate-extraction",
    13.777608645915299
  ],
  [
    "south-floor-2-west",
    "yard",
    26.41514716975849
  ],
  [
    "south-floor-2-west",
    "teaching-supply",
    19.436048981210146
  ],
  [
    "south-floor-2-west",
    "library-west",
    13.629380029920656
  ],
  [
    "south-floor-2-west",
    "sports-north",
    11.034491379306976
  ],
  [
    "south-floor-2-west",
    "sports-road",
    13.629380029920656
  ],
  [
    "south-floor-2-west",
    "south-floor-1",
    24.29897117163605
  ],
  [
    "south-floor-2-west",
    "south-floor-2",
    16
  ],
  [
    "south-floor-2-west",
    "south-floor-1-west",
    8.85663593019381
  ],
  [
    "south-floor-2-west",
    "hf-middle-f1",
    8.85663593019381
  ],
  [
    "hf-middle-f1",
    "gate-extraction",
    18.506823066101862
  ],
  [
    "hf-middle-f1",
    "yard",
    33.20301191157212
  ],
  [
    "hf-middle-f1",
    "teaching-supply",
    25.582024939398366
  ],
  [
    "hf-middle-f1",
    "library-west",
    18.287700784953806
  ],
  [
    "hf-middle-f1",
    "sports-north",
    11.934822998268555
  ],
  [
    "hf-middle-f1",
    "sports-road",
    8.85663593019381
  ],
  [
    "hf-middle-f1",
    "south-floor-1",
    32
  ],
  [
    "hf-middle-f1",
    "south-floor-2",
    24.29897117163605
  ],
  [
    "hf-middle-f1",
    "south-floor-1-west",
    16
  ],
  [
    "hf-middle-f1",
    "south-floor-2-west",
    8.85663593019381
  ]
];
