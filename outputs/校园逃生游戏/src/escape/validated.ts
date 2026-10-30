// Anonymous example geometry. Formal campus calibration is distributed separately.
import type {EscapeSite,EscapeVec3} from './types.ts';
export const VALIDATED_ESCAPE_MAP_CATALOG_ID="web-r01-campus-1";
export const VALIDATED_ESCAPE_SITES:EscapeSite[]=[
  {
    "id": "yard",
    "label": "示例地点 1",
    "region": "teaching",
    "position": [
      -15.5,
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
      -7.5,
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
      0.5,
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
      8.5,
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
      16.5,
      0,
      -16
    ],
    "floor": 0
  },
  {
    "id": "canteen-north",
    "label": "示例地点 6",
    "region": "canteen",
    "position": [
      -15.5,
      0,
      -8
    ],
    "floor": 0
  },
  {
    "id": "dorm-road",
    "label": "示例地点 7",
    "region": "dorm",
    "position": [
      -7.5,
      0,
      -8
    ],
    "floor": 0
  },
  {
    "id": "dorm-yard",
    "label": "示例地点 8",
    "region": "dorm",
    "position": [
      0.5,
      0,
      -8
    ],
    "floor": 0,
    "roles": [
      "take",
      "deliver"
    ]
  },
  {
    "id": "south-floor-1",
    "label": "示例地点 9",
    "region": "teaching",
    "position": [
      8.5,
      3.8,
      -8
    ],
    "floor": 1,
    "roles": [
      "take",
      "activate",
      "deliver"
    ],
    "buildingId": "south-teaching",
    "levelId": "south-f1"
  },
  {
    "id": "south-floor-2",
    "label": "示例地点 10",
    "region": "teaching",
    "position": [
      16.5,
      7.6,
      -8
    ],
    "floor": 2,
    "roles": [
      "take",
      "activate",
      "deliver"
    ],
    "buildingId": "south-teaching",
    "levelId": "south-f2"
  },
  {
    "id": "south-floor-1-west",
    "label": "示例地点 11",
    "region": "teaching",
    "position": [
      -15.5,
      3.8,
      0
    ],
    "floor": 1,
    "roles": [
      "activate"
    ],
    "buildingId": "south-teaching",
    "levelId": "south-f1"
  },
  {
    "id": "south-floor-2-west",
    "label": "示例地点 12",
    "region": "teaching",
    "position": [
      -7.5,
      7.6,
      0
    ],
    "floor": 2,
    "roles": [
      "activate"
    ],
    "buildingId": "south-teaching",
    "levelId": "south-f2"
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
    "id": "npc-dorm-north",
    "label": "示例地点 5",
    "region": "dorm",
    "floor": 0,
    "position": [
      16,
      0,
      -16
    ]
  },
  {
    "id": "npc-teaching-west",
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
    "id": "npc-teaching-east",
    "label": "示例地点 7",
    "region": "teaching",
    "floor": 0,
    "position": [
      -8,
      0,
      -8
    ]
  },
  {
    "id": "npc-sports-west-north",
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
    "id": "npc-sports-west-south",
    "label": "示例地点 9",
    "region": "sports",
    "floor": 0,
    "position": [
      8,
      0,
      -8
    ]
  },
  {
    "id": "npc-canteen-west-upper",
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
    "id": "npc-canteen-west-lower",
    "label": "示例地点 11",
    "region": "canteen",
    "floor": 0,
    "position": [
      -16,
      0,
      0
    ]
  },
  {
    "id": "npc-dorm-upper",
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
    "id": "npc-dorm-upper-road",
    "label": "示例地点 13",
    "region": "dorm",
    "floor": 0,
    "position": [
      0,
      0,
      0
    ]
  },
  {
    "id": "npc-teaching-west-upper",
    "label": "示例地点 14",
    "region": "teaching",
    "floor": 0,
    "position": [
      8,
      0,
      0
    ]
  },
  {
    "id": "npc-teaching-east-upper",
    "label": "示例地点 15",
    "region": "teaching",
    "floor": 0,
    "position": [
      16,
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
    22.276669409945463
  ],
  [
    "gate-extraction",
    "teaching-supply",
    17.67059704707229
  ],
  [
    "gate-extraction",
    "library-west",
    16.00781059358212
  ],
  [
    "gate-extraction",
    "sports-north",
    18.117670931993437
  ],
  [
    "gate-extraction",
    "sports-road",
    22.983689869122408
  ],
  [
    "gate-extraction",
    "canteen-north",
    17.442763542512406
  ],
  [
    "gate-extraction",
    "dorm-road",
    10.965856099730654
  ],
  [
    "gate-extraction",
    "dorm-yard",
    8.0156097709407
  ],
  [
    "gate-extraction",
    "south-floor-1",
    12.27558552574988
  ],
  [
    "gate-extraction",
    "south-floor-2",
    19.84968513604183
  ],
  [
    "gate-extraction",
    "south-floor-1-west",
    15.95900999435742
  ],
  [
    "gate-extraction",
    "south-floor-2-west",
    10.677546534667972
  ],
  [
    "yard",
    "gate-extraction",
    22.276669409945463
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
    "canteen-north",
    8
  ],
  [
    "yard",
    "dorm-road",
    11.313708498984761
  ],
  [
    "yard",
    "dorm-yard",
    17.88854381999832
  ],
  [
    "yard",
    "south-floor-1",
    25.582024939398366
  ],
  [
    "yard",
    "south-floor-2",
    33.84907679686405
  ],
  [
    "yard",
    "south-floor-1-west",
    16.44506004853737
  ],
  [
    "yard",
    "south-floor-2-west",
    19.436048981210146
  ],
  [
    "teaching-supply",
    "gate-extraction",
    17.67059704707229
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
    "canteen-north",
    11.313708498984761
  ],
  [
    "teaching-supply",
    "dorm-road",
    8
  ],
  [
    "teaching-supply",
    "dorm-yard",
    11.313708498984761
  ],
  [
    "teaching-supply",
    "south-floor-1",
    18.287700784953806
  ],
  [
    "teaching-supply",
    "south-floor-2",
    26.41514716975849
  ],
  [
    "teaching-supply",
    "south-floor-1-west",
    18.287700784953806
  ],
  [
    "teaching-supply",
    "south-floor-2-west",
    17.71327186038762
  ],
  [
    "library-west",
    "gate-extraction",
    16.00781059358212
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
    "canteen-north",
    17.88854381999832
  ],
  [
    "library-west",
    "dorm-road",
    11.313708498984761
  ],
  [
    "library-west",
    "dorm-yard",
    8
  ],
  [
    "library-west",
    "south-floor-1",
    11.934822998268555
  ],
  [
    "library-west",
    "south-floor-2",
    19.436048981210146
  ],
  [
    "library-west",
    "south-floor-1-west",
    22.94428033301546
  ],
  [
    "library-west",
    "south-floor-2-west",
    19.436048981210146
  ],
  [
    "sports-north",
    "gate-extraction",
    18.117670931993437
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
    "canteen-north",
    25.298221281347036
  ],
  [
    "sports-north",
    "dorm-road",
    17.88854381999832
  ],
  [
    "sports-north",
    "dorm-yard",
    11.313708498984761
  ],
  [
    "sports-north",
    "south-floor-1",
    8.85663593019381
  ],
  [
    "sports-north",
    "south-floor-2",
    13.629380029920656
  ],
  [
    "sports-north",
    "south-floor-1-west",
    29.09364191709247
  ],
  [
    "sports-north",
    "south-floor-2-west",
    23.86964599653711
  ],
  [
    "sports-road",
    "gate-extraction",
    22.983689869122408
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
    "canteen-north",
    32.984845004941285
  ],
  [
    "sports-road",
    "dorm-road",
    25.298221281347036
  ],
  [
    "sports-road",
    "dorm-yard",
    17.88854381999832
  ],
  [
    "sports-road",
    "south-floor-1",
    11.934822998268555
  ],
  [
    "sports-road",
    "south-floor-2",
    11.034491379306976
  ],
  [
    "sports-road",
    "south-floor-1-west",
    35.97832680934454
  ],
  [
    "sports-road",
    "south-floor-2-west",
    29.828845100003452
  ],
  [
    "canteen-north",
    "gate-extraction",
    17.442763542512406
  ],
  [
    "canteen-north",
    "yard",
    8
  ],
  [
    "canteen-north",
    "teaching-supply",
    11.313708498984761
  ],
  [
    "canteen-north",
    "library-west",
    17.88854381999832
  ],
  [
    "canteen-north",
    "sports-north",
    25.298221281347036
  ],
  [
    "canteen-north",
    "sports-road",
    32.984845004941285
  ],
  [
    "canteen-north",
    "dorm-road",
    8
  ],
  [
    "canteen-north",
    "dorm-yard",
    16
  ],
  [
    "canteen-north",
    "south-floor-1",
    24.29897117163605
  ],
  [
    "canteen-north",
    "south-floor-2",
    32.89012009707474
  ],
  [
    "canteen-north",
    "south-floor-1-west",
    8.85663593019381
  ],
  [
    "canteen-north",
    "south-floor-2-west",
    13.629380029920656
  ],
  [
    "dorm-road",
    "gate-extraction",
    10.965856099730654
  ],
  [
    "dorm-road",
    "yard",
    11.313708498984761
  ],
  [
    "dorm-road",
    "teaching-supply",
    8
  ],
  [
    "dorm-road",
    "library-west",
    11.313708498984761
  ],
  [
    "dorm-road",
    "sports-north",
    17.88854381999832
  ],
  [
    "dorm-road",
    "sports-road",
    25.298221281347036
  ],
  [
    "dorm-road",
    "canteen-north",
    8
  ],
  [
    "dorm-road",
    "dorm-yard",
    8
  ],
  [
    "dorm-road",
    "south-floor-1",
    16.44506004853737
  ],
  [
    "dorm-road",
    "south-floor-2",
    25.1745903640953
  ],
  [
    "dorm-road",
    "south-floor-1-west",
    11.934822998268555
  ],
  [
    "dorm-road",
    "south-floor-2-west",
    11.034491379306976
  ],
  [
    "dorm-yard",
    "gate-extraction",
    8.0156097709407
  ],
  [
    "dorm-yard",
    "yard",
    17.88854381999832
  ],
  [
    "dorm-yard",
    "teaching-supply",
    11.313708498984761
  ],
  [
    "dorm-yard",
    "library-west",
    8
  ],
  [
    "dorm-yard",
    "sports-north",
    11.313708498984761
  ],
  [
    "dorm-yard",
    "sports-road",
    17.88854381999832
  ],
  [
    "dorm-yard",
    "canteen-north",
    16
  ],
  [
    "dorm-yard",
    "dorm-road",
    8
  ],
  [
    "dorm-yard",
    "south-floor-1",
    8.85663593019381
  ],
  [
    "dorm-yard",
    "south-floor-2",
    17.71327186038762
  ],
  [
    "dorm-yard",
    "south-floor-1-west",
    18.287700784953806
  ],
  [
    "dorm-yard",
    "south-floor-2-west",
    13.629380029920656
  ],
  [
    "south-floor-1",
    "gate-extraction",
    12.27558552574988
  ],
  [
    "south-floor-1",
    "yard",
    25.582024939398366
  ],
  [
    "south-floor-1",
    "teaching-supply",
    18.287700784953806
  ],
  [
    "south-floor-1",
    "library-west",
    11.934822998268555
  ],
  [
    "south-floor-1",
    "sports-north",
    8.85663593019381
  ],
  [
    "south-floor-1",
    "sports-road",
    11.934822998268555
  ],
  [
    "south-floor-1",
    "canteen-north",
    24.29897117163605
  ],
  [
    "south-floor-1",
    "dorm-road",
    16.44506004853737
  ],
  [
    "south-floor-1",
    "dorm-yard",
    8.85663593019381
  ],
  [
    "south-floor-1",
    "south-floor-2",
    8.85663593019381
  ],
  [
    "south-floor-1",
    "south-floor-1-west",
    25.298221281347036
  ],
  [
    "south-floor-1",
    "south-floor-2-west",
    18.287700784953806
  ],
  [
    "south-floor-2",
    "gate-extraction",
    19.84968513604183
  ],
  [
    "south-floor-2",
    "yard",
    33.84907679686405
  ],
  [
    "south-floor-2",
    "teaching-supply",
    26.41514716975849
  ],
  [
    "south-floor-2",
    "library-west",
    19.436048981210146
  ],
  [
    "south-floor-2",
    "sports-north",
    13.629380029920656
  ],
  [
    "south-floor-2",
    "sports-road",
    11.034491379306976
  ],
  [
    "south-floor-2",
    "canteen-north",
    32.89012009707474
  ],
  [
    "south-floor-2",
    "dorm-road",
    25.1745903640953
  ],
  [
    "south-floor-2",
    "dorm-yard",
    17.71327186038762
  ],
  [
    "south-floor-2",
    "south-floor-1",
    8.85663593019381
  ],
  [
    "south-floor-2",
    "south-floor-1-west",
    33.20301191157212
  ],
  [
    "south-floor-2",
    "south-floor-2-west",
    25.298221281347036
  ],
  [
    "south-floor-1-west",
    "gate-extraction",
    15.95900999435742
  ],
  [
    "south-floor-1-west",
    "yard",
    16.44506004853737
  ],
  [
    "south-floor-1-west",
    "teaching-supply",
    18.287700784953806
  ],
  [
    "south-floor-1-west",
    "library-west",
    22.94428033301546
  ],
  [
    "south-floor-1-west",
    "sports-north",
    29.09364191709247
  ],
  [
    "south-floor-1-west",
    "sports-road",
    35.97832680934454
  ],
  [
    "south-floor-1-west",
    "canteen-north",
    8.85663593019381
  ],
  [
    "south-floor-1-west",
    "dorm-road",
    11.934822998268555
  ],
  [
    "south-floor-1-west",
    "dorm-yard",
    18.287700784953806
  ],
  [
    "south-floor-1-west",
    "south-floor-1",
    25.298221281347036
  ],
  [
    "south-floor-1-west",
    "south-floor-2",
    33.20301191157212
  ],
  [
    "south-floor-1-west",
    "south-floor-2-west",
    8.85663593019381
  ],
  [
    "south-floor-2-west",
    "gate-extraction",
    10.677546534667972
  ],
  [
    "south-floor-2-west",
    "yard",
    19.436048981210146
  ],
  [
    "south-floor-2-west",
    "teaching-supply",
    17.71327186038762
  ],
  [
    "south-floor-2-west",
    "library-west",
    19.436048981210146
  ],
  [
    "south-floor-2-west",
    "sports-north",
    23.86964599653711
  ],
  [
    "south-floor-2-west",
    "sports-road",
    29.828845100003452
  ],
  [
    "south-floor-2-west",
    "canteen-north",
    13.629380029920656
  ],
  [
    "south-floor-2-west",
    "dorm-road",
    11.034491379306976
  ],
  [
    "south-floor-2-west",
    "dorm-yard",
    13.629380029920656
  ],
  [
    "south-floor-2-west",
    "south-floor-1",
    18.287700784953806
  ],
  [
    "south-floor-2-west",
    "south-floor-2",
    25.298221281347036
  ],
  [
    "south-floor-2-west",
    "south-floor-1-west",
    8.85663593019381
  ]
];
