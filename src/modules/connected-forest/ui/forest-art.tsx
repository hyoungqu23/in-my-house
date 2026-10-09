"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import type { ForestSpeciesId, ForestTerrainKind } from "../domain/types";

export const FOREST_FRIENDS = {
  squirrel: { name: "다람쥐", note: "도토리는 반으로 나눠 먹어요.", color: "#bb6941", light: "#edb179", ground: "#f4e1c6" },
  otter: { name: "수달", note: "좋아하는 조약돌을 가져왔어요.", color: "#806252", light: "#bba183", ground: "#dceae9" },
  rabbit: { name: "토끼", note: "꽃 한 송이, 네 생각이 났어.", color: "#d1aba0", light: "#fff0df", ground: "#f1e0df" },
  hedgehog: { name: "고슴도치", note: "등에 낙엽이 붙은 줄도 모르고요.", color: "#956a51", light: "#d7a575", ground: "#eee3cd" },
  frog: { name: "개구리", note: "비 오는 날에는 내가 마중 갈게.", color: "#609574", light: "#b7d58b", ground: "#e3ecd0" },
  fox: { name: "여우", note: "꼬리 담요는 같이 덮어도 돼.", color: "#bb6446", light: "#eeac72", ground: "#f4dec8" },
  owl: { name: "부엉이", note: "아직 안 잤지? 별 보러 가자.", color: "#77756b", light: "#c0ad87", ground: "#e6e3ed" },
  beaver: { name: "비버", note: "우리 사이에 작은 다리를 놓아요.", color: "#916047", light: "#c79562", ground: "#e8e4d1" },
  deer: { name: "사슴", note: "새로 난 숲길을 알려줄게요.", color: "#b78354", light: "#e7c08c", ground: "#eee8d4" },
  mole: { name: "두더지", note: "땅속에서 가장 예쁜 돌을 찾았어요.", color: "#777b85", light: "#b5adb2", ground: "#e5e3e7" },
  duck: { name: "오리", note: "물웅덩이를 만나면 잠깐 쉬어요.", color: "#d4a856", light: "#fff0ad", ground: "#f2ebcd" },
  tanuki: { name: "너구리", note: "머리 위 나뭇잎, 잘 어울리나요?", color: "#938374", light: "#d3bea0", ground: "#e8e0db" },
} satisfies Record<ForestSpeciesId, { name: string; note: string; color: string; light: string; ground: string }>;

export const FOREST_TERRAIN_ART = {
  TREE: { name: "나무", description: "폭신한 초록 그늘", top: "#c9dfae", side: "#91ad7f" },
  WATER: { name: "물", description: "동그란 물결 하나", top: "#b9dcd8", side: "#79ada7" },
  FLOWER: { name: "꽃", description: "살구빛 꽃이 방긋", top: "#e6deb2", side: "#b8b184" },
  ROCK: { name: "바위", description: "손안에 쏙, 조약돌", top: "#d9d6ce", side: "#aaa89f" },
  MUSHROOM: { name: "버섯", description: "빨간 지붕 아래서", top: "#ded7ad", side: "#b2aa83" },
} satisfies Record<ForestTerrainKind, { name: string; description: string; top: string; side: string }>;

function Face({ y = 99, eyes = 15 }: { y?: number; eyes?: number }) {
  return <g>
    <ellipse cx={100 - eyes} cy={y} rx="3.5" ry="4.6" fill="#3d3531" />
    <ellipse cx={100 + eyes} cy={y} rx="3.5" ry="4.6" fill="#3d3531" />
    <circle cx={99 - eyes} cy={y - 2} r="1.2" fill="#fffaf0" />
    <circle cx={99 + eyes} cy={y - 2} r="1.2" fill="#fffaf0" />
    <ellipse cx={92 - eyes} cy={y + 11} rx="7" ry="3.7" fill="#df9a89" opacity=".57" />
    <ellipse cx={108 + eyes} cy={y + 11} rx="7" ry="3.7" fill="#df9a89" opacity=".57" />
    <path d={`M96 ${y + 9} Q100 ${y + 6} 104 ${y + 9} Q100 ${y + 15} 96 ${y + 9}`} fill="#73554b" />
    <path d={`M100 ${y + 13} Q95 ${y + 19} 91 ${y + 14} M100 ${y + 13} Q105 ${y + 19} 109 ${y + 14}`} fill="none" stroke="#73554b" strokeWidth="1.7" strokeLinecap="round" />
  </g>;
}

/** Original vector silhouettes; no emoji, bitmap or external image dependency. */
function AnimalShape({ species, coat, shade }: { species: ForestSpeciesId; coat: string; shade: string }) {
  const paws = <g fill={shade}><ellipse cx="77" cy="164" rx="17" ry="9" /><ellipse cx="122" cy="164" rx="17" ry="9" /></g>;
  const body = <><ellipse cx="100" cy="139" rx="37" ry="32" fill={coat} /><ellipse cx="100" cy="146" rx="24" ry="22" fill="#f5dfba" />{paws}</>;
  const ears = <g fill={coat}><circle cx="65" cy="65" r="17" /><circle cx="134" cy="65" r="17" /><g fill="#e9b0a0"><circle cx="65" cy="65" r="9" /><circle cx="134" cy="65" r="9" /></g></g>;
  switch (species) {
    case "squirrel": return <>
      <path d="M132 156C190 166 193 89 170 64C150 40 130 52 138 70C145 84 168 86 157 112C150 131 129 123 123 140Z" fill={coat} />
      <path d="M152 150C173 143 179 116 169 98" fill="none" stroke="#f6cf9c" strokeWidth="8" strokeLinecap="round" />
      {body}{ears}
      <ellipse cx="100" cy="100" rx="45" ry="36" fill={coat} /><ellipse cx="100" cy="116" rx="24" ry="18" fill="#f9e5c7" /><Face />
      <g transform="translate(84 136)"><ellipse cx="16" cy="14" rx="12" ry="17" fill="#b58148" /><path d="M1 8Q16-3 31 8V14H1Z" fill="#6e7752" /><path d="M17 1V-4" stroke="#6e7752" strokeWidth="4" strokeLinecap="round" /></g>
      <path d="M73 139L85 144M127 139L115 144" stroke={shade} strokeWidth="12" strokeLinecap="round" />
    </>;
    case "rabbit": return <>
      <g fill={coat}><ellipse cx="80" cy="51" rx="14" ry="36" transform="rotate(-13 80 51)" /><ellipse cx="119" cy="49" rx="14" ry="37" transform="rotate(9 119 49)" /></g>
      <g fill="#dfb0a5"><ellipse cx="80" cy="48" rx="6" ry="25" transform="rotate(-13 80 48)" /><ellipse cx="119" cy="46" rx="6" ry="25" transform="rotate(9 119 46)" /></g>
      {body}<ellipse cx="100" cy="103" rx="43" ry="36" fill={coat} /><Face eyes={17} />
      <path d="M110 154L130 126" stroke="#739a72" strokeWidth="4" /><g transform="translate(130 121)" fill="#df947e"><circle cx="-6" cy="0" r="7" /><circle cx="5" cy="-3" r="7" /><circle cx="3" cy="7" r="7" /><circle cx="0" cy="1" r="4" fill="#f6d68b" /></g>
    </>;
    case "fox": return <>
      <path d="M121 156Q173 184 180 127Q161 131 151 110Q159 151 121 140" fill={coat} /><path d="M180 127Q174 154 155 152L158 137L151 110Q161 131 180 127" fill="#f7e8cd" />
      {body}<path d="M59 91L57 37Q78 38 88 72L114 72Q131 40 148 38L144 102Q144 126 101 140Q60 126 59 91" fill={coat} />
      <path d="M63 51L69 83L81 72ZM140 51L120 76L138 84Z" fill="#774e41" />
      <path d="M57 96Q78 86 100 112Q122 84 145 96Q136 126 100 137Q65 123 57 96" fill="#fff0d5" /><Face y={98} eyes={19} />
    </>;
    case "hedgehog": return <>

      <path d="M39 132L36 110L48 103L43 82L63 82L64 59L84 68L99 47L111 66L130 57L135 80L156 78L154 98L173 108L160 125L167 142L139 163H67Z" fill={coat} />
      {paws}
      <ellipse cx="100" cy="127" rx="43" ry="37" fill="#edd1ab" /><Face y={120} />
      <path d="M131 70Q154 41 164 61Q155 81 131 70" fill="#c78b52" /><path d="M133 70L158 59" stroke="#84694c" strokeWidth="2" />
    </>;
    case "frog": return <>
      <ellipse cx="100" cy="145" rx="42" ry="28" fill={coat} /><ellipse cx="100" cy="149" rx="28" ry="20" fill="#e7e6af" />
      <g fill={shade}><ellipse cx="65" cy="164" rx="23" ry="9" /><ellipse cx="135" cy="164" rx="23" ry="9" /></g>
      <g fill={coat}><circle cx="72" cy="75" r="23" /><circle cx="128" cy="75" r="23" /><ellipse cx="100" cy="105" rx="55" ry="36" /></g>
      <g fill="#f4f1cf"><circle cx="72" cy="74" r="14" /><circle cx="128" cy="74" r="14" /></g>
      <g fill="#364839"><ellipse cx="73" cy="75" rx="4" ry="6" /><ellipse cx="127" cy="75" rx="4" ry="6" /></g>
      <g fill="#d7a58b"><ellipse cx="63" cy="105" rx="9" ry="5" /><ellipse cx="137" cy="105" rx="9" ry="5" /></g>
      <path d="M83 110Q100 123 117 110" stroke="#416849" strokeWidth="3" fill="none" strokeLinecap="round" /><circle cx="87" cy="95" r="2" fill={shade} /><circle cx="113" cy="95" r="2" fill={shade} />
    </>;
    case "owl": return <>
      {paws}
      <ellipse cx="100" cy="119" rx="49" ry="51" fill={coat} /><path d="M58 122Q64 155 82 157M142 122Q135 155 119 157" stroke={shade} strokeWidth="15" strokeLinecap="round" />
      <circle cx="80" cy="97" r="25" fill="#f6e5c5" /><circle cx="121" cy="97" r="25" fill="#f6e5c5" /><g fill="#44413b"><ellipse cx="81" cy="98" rx="5" ry="7" /><ellipse cx="120" cy="98" rx="5" ry="7" /></g>
      <path d="M92 111Q100 105 108 111L100 123Z" fill="#dba664" /><g fill="#eee0bf"><path d="M86 135L92 141L98 134L92 149ZM106 135L112 141L118 134L112 149Z" /></g>
    </>;
    case "deer": return <>
      <g stroke="#896749" strokeWidth="6" fill="none" strokeLinecap="round"><path d="M77 72V41L66 30M77 48L91 35M125 72V41L136 30M125 48L111 35" /></g>
      {body}<path d="M67 88Q32 80 41 62Q65 60 78 83M129 88Q165 80 156 62Q132 60 120 83" fill={coat} />
      <ellipse cx="100" cy="103" rx="39" ry="39" fill={coat} /><ellipse cx="100" cy="119" rx="22" ry="17" fill="#f5e3c1" /><Face eyes={14} />
      <g fill="#ffebc9"><circle cx="87" cy="79" r="3" /><circle cx="101" cy="76" r="3" /><circle cx="114" cy="80" r="3" /></g>
    </>;
    case "duck": return <>
      <g fill="#d9954c"><ellipse cx="81" cy="165" rx="18" ry="8" /><ellipse cx="123" cy="165" rx="18" ry="8" /></g>
      <path d="M100 48C122 48 140 66 140 88C140 100 134 108 133 118C150 134 145 158 122 167C103 177 64 165 48 150C38 139 32 127 34 116C38 133 52 132 65 125C71 121 75 119 74 113C65 106 60 98 60 88C60 66 78 48 100 48Z" fill={coat} />
      <path d="M91 52Q83 33 108 38L102 52" fill={coat} />
      <g fill="#454131"><ellipse cx="85" cy="87" rx="4" ry="5" /><ellipse cx="114" cy="87" rx="4" ry="5" /></g>
      <ellipse cx="100" cy="106" rx="19" ry="9" fill="#e8a955" /><path d="M83 106Q100 110 117 106" stroke="#be8148" strokeWidth="2" fill="none" />
      <path d="M97 132Q128 121 125 144Q113 159 94 145" fill="#f7db8a" />
    </>;
    case "mole": return <>
      <ellipse cx="100" cy="118" rx="48" ry="51" fill={coat} />
      <ellipse cx="100" cy="107" rx="28" ry="18" fill="#dbb5ac" /><ellipse cx="100" cy="103" rx="14" ry="9" fill="#c38e85" />
      <path d="M67 95L75 98M125 98L133 95" stroke="#43434a" strokeWidth="4" strokeLinecap="round" />
      <g fill="#e5c3b3"><ellipse cx="62" cy="151" rx="18" ry="12" transform="rotate(-20 62 151)" /><ellipse cx="138" cy="151" rx="18" ry="12" transform="rotate(20 138 151)" /></g>
      <g stroke="#a78078" strokeWidth="2" strokeLinecap="round"><path d="M53 150L56 159M61 149L64 158M136 149L133 158M144 150L141 159" /></g>
    </>;
    case "otter": return <>
      {/* Low ears, long pear-shaped torso and a tapered swimming tail. */}
      <path d="M116 150C139 153 157 148 171 130C176 159 150 177 118 166Z" fill={shade} />
      <path d="M137 165Q157 161 164 148" fill="none" stroke="#ad9074" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M76 97C57 117 61 151 72 167Q99 180 124 165C136 145 130 112 118 96Z" fill={coat} />
      <path d="M85 106C73 124 75 151 85 161Q99 171 113 159C121 142 115 119 110 106Z" fill="#e9d7b8" />
      <g fill={shade}><ellipse cx="80" cy="168" rx="15" ry="7" /><ellipse cx="116" cy="167" rx="14" ry="7" /></g>
      <circle cx="63" cy="79" r="10" fill={coat} /><circle cx="135" cy="79" r="10" fill={coat} />
      <g fill="#806653"><circle cx="63" cy="80" r="4.5" /><circle cx="135" cy="80" r="4.5" /></g>
      <path d="M56 89C56 63 79 58 100 59C128 58 144 73 144 92C144 116 121 125 100 124C77 123 55 113 56 89Z" fill={coat} />
      <path d="M64 96Q76 83 99 98Q120 83 136 97C136 115 115 122 99 121C81 120 65 113 64 96Z" fill="#f1e2c8" />
      <Face y={87} eyes={20} />
      <path d="M96 96Q100 92 105 96L101 101Q97 101 96 96Z" fill="#4f4037" />
      <g fill="#9a8070"><circle cx="83" cy="103" r="1.1" /><circle cx="86" cy="106" r="1" /><circle cx="117" cy="103" r="1.1" /><circle cx="114" cy="106" r="1" /></g>
      <path d="M76 103L55 99M76 108L53 110M124 103L145 99M124 108L148 110" stroke="#7c6857" strokeWidth="1.4" strokeLinecap="round" />
      <ellipse cx="101" cy="143" rx="17" ry="13" fill="#718e8c" transform="rotate(-12 101 143)" />
      <path d="M91 138Q98 132 106 135" stroke="#b8cdc0" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M76 130Q73 140 86 144M122 129Q128 138 117 144" stroke={shade} strokeWidth="12" fill="none" strokeLinecap="round" />
      <path d="M79 141L83 144M120 140L118 143" stroke="#c3a88a" strokeWidth="1.5" strokeLinecap="round" />
    </>;
    case "beaver": return <>
      {/* Broad paddle tail and cheek pads, not the shared round-ear body. */}
      <g transform="rotate(35 149 140)">
        <rect x="129" y="106" width="39" height="67" rx="19" fill="#695246" />
        <path d="M135 117Q149 108 161 118V153Q150 168 137 157Z" fill="#826650" />
        <path d="M135 123L162 150M134 136L156 158M145 115L163 133M137 150L162 125M134 137L155 116M147 160L164 143" stroke="#b3946c" strokeWidth="1.5" opacity=".65" />
      </g>
      <path d="M65 108C49 122 52 154 68 167Q94 180 122 166C139 152 133 120 117 108Z" fill={coat} />
      <ellipse cx="94" cy="143" rx="26" ry="25" fill="#dfbb87" />
      <g fill={shade}><ellipse cx="71" cy="168" rx="19" ry="8" /><ellipse cx="116" cy="168" rx="18" ry="8" /></g>
      <g fill={coat}><ellipse cx="65" cy="68" rx="11" ry="13" transform="rotate(-20 65 68)" /><ellipse cx="124" cy="68" rx="11" ry="13" transform="rotate(20 124 68)" /></g>
      <g fill="#986b50"><ellipse cx="65" cy="69" rx="5" ry="7" /><ellipse cx="124" cy="69" rx="5" ry="7" /></g>
      <path d="M52 91C52 62 77 58 96 59C123 58 141 73 139 96C138 120 120 128 94 127C69 127 52 115 52 91Z" fill={coat} />
      <path d="M72 77Q82 67 94 68" stroke="#e2ba86" strokeWidth="3" fill="none" strokeLinecap="round" />
      <g fill="#eacb99"><ellipse cx="81" cy="108" rx="20" ry="15" /><ellipse cx="111" cy="108" rx="20" ry="15" /></g>
      <g fill="#fff5d9" stroke="#c1a276" strokeWidth="1"><path d="M93 103L100 104V114Q93 117 93 112Z" /><path d="M101 104L108 103V112Q107 116 101 114Z" /></g>
      <Face y={89} eyes={19} />
      <path d="M92 99Q100 94 107 99Q104 108 99 107Q94 106 92 99Z" fill="#614638" />
      <g transform="rotate(-10 96 143)">
        <rect x="62" y="135" width="68" height="17" rx="8" fill="#ae8554" />
        <ellipse cx="126" cy="143.5" rx="6" ry="8.5" fill="#efd5a2" /><ellipse cx="126" cy="143.5" rx="3" ry="5" fill="none" stroke="#bd945e" strokeWidth="1.3" />
        <path d="M71 140H110M79 147H115" stroke="#805d3e" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M112 135Q113 120 128 123Q127 138 112 135Z" fill="#8b9b62" />
        <path d="M113 134L122 127" stroke="#d8db9d" strokeWidth="1.3" />
      </g>
      <path d="M66 130Q62 135 72 140M126 126Q133 133 120 139" stroke={shade} strokeWidth="12" fill="none" strokeLinecap="round" />
    </>;
    case "tanuki": return <>
      {/* A Japanese raccoon dog: cheek ruff and dark socks; no ringed raccoon tail. */}
      <path d="M119 142Q160 118 170 142Q185 171 132 172Z" fill={coat} />
      <path d="M162 133Q183 143 171 161Q164 170 150 170Q165 156 155 144Z" fill="#625851" />
      <path d="M72 109Q47 142 69 167Q101 181 130 164Q148 140 125 109Z" fill={coat} />
      <path d="M79 119Q99 107 121 120L125 145Q102 171 76 148Z" fill="#f0dfbd" />
      <g fill="#63564c"><ellipse cx="74" cy="166" rx="17" ry="9" /><ellipse cx="123" cy="166" rx="17" ry="9" /><ellipse cx="70" cy="136" rx="9" ry="15" transform="rotate(-18 70 136)" /><ellipse cx="130" cy="136" rx="9" ry="15" transform="rotate(18 130 136)" /></g>
      <path d="M61 82Q47 42 65 44Q81 47 88 65M117 65Q132 39 142 46Q153 56 137 85" fill="#66574b" />
      <path d="M65 69Q60 47 68 54L78 68M125 68L136 53Q145 51 137 72" fill="#bd9984" />
      <path d="M60 79Q67 61 95 61Q129 59 141 82L146 93L139 94L148 108L137 109L137 119Q116 133 100 130Q79 133 60 119L61 110L51 109L59 98L52 96Z" fill={coat} />
      <path d="M58 104Q74 107 88 117L100 109L113 117Q129 106 142 105L137 119Q119 133 100 131Q78 132 60 119Z" fill="#f4e4c7" />
      <path d="M61 91Q70 77 88 83L98 100Q78 114 65 107ZM102 100L112 83Q128 77 138 91L135 107Q121 114 102 100Z" fill="#62564e" />
      <g fill="#2f302b"><ellipse cx="82" cy="95" rx="3.5" ry="4.5" /><ellipse cx="118" cy="95" rx="3.5" ry="4.5" /></g>
      <g fill="#fff8e5"><circle cx="81" cy="93.5" r="1.4" /><circle cx="117" cy="93.5" r="1.4" /></g>
      <path d="M88 108Q100 96 112 108Q111 123 100 123Q89 122 88 108Z" fill="#f4e4c7" />
      <path d="M95 108Q100 104 105 108Q100 115 95 108Z" fill="#51453b" />
      <path d="M100 113Q95 119 92 115M100 113Q105 119 108 115" stroke="#806556" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <g fill="#d79981" opacity=".65"><ellipse cx="70" cy="111" rx="6" ry="3" /><ellipse cx="130" cy="111" rx="6" ry="3" /></g>
      <path d="M90 63Q95 39 123 43Q124 66 101 66L95 61Z" fill="#81966b" />
      <path d="M91 66Q105 51 119 47M102 55L101 47M109 52L115 57" fill="none" stroke="#c7d49b" strokeWidth="1.6" strokeLinecap="round" />
    </>;
  }
}

export function ForestAnimalArt({ species, decorative = false, className }: { species: ForestSpeciesId; decorative?: boolean; className?: string }) {
  const id = useId();
  const friend = FOREST_FRIENDS[species];
  return <svg className={className} viewBox="0 0 200 200" width="200" height="200" role={decorative ? undefined : "img"} aria-hidden={decorative || undefined} aria-labelledby={decorative ? undefined : `${id}-title`} focusable="false">
    {!decorative && <title id={`${id}-title`}>{`${friend.name} 점토 미니어처 일러스트`}</title>}
    <defs><linearGradient id={`${id}-coat`} x1=".1" x2=".9" y1="0" y2="1"><stop stopColor={friend.light} /><stop offset="1" stopColor={friend.color} /></linearGradient></defs>
    <ellipse cx="102" cy="177" rx="60" ry="9" fill="#665846" opacity=".12" />
    <AnimalShape species={species} coat={`url(#${id}-coat)`} shade={friend.color} />
  </svg>;
}

function Sprig({ x, y, scale = 1, rotate = 0 }: { x: number; y: number; scale?: number; rotate?: number }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
    <path d="M0 0Q-3-13 1-24" stroke="#6f8760" strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M-1-7Q-16-6-13-17Q-2-18-1-7" fill="#8ca875" />
    <path d="M-1-14Q12-12 12-23Q2-24-1-14" fill="#b1c38b" />
    <path d="M-2-10L-9-14M1-17L8-20" stroke="#d7ddb0" strokeWidth="1" strokeLinecap="round" />
  </g>;
}

function Blossom({ x, y, scale = 1, petal }: { x: number; y: number; scale?: number; petal: string }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    {[0, 72, 144, 216, 288].map((angle) => <g key={angle} transform={`rotate(${angle})`}>
      <path d="M-4-2C-23-13-9-31 0-24C10-30 23-12 4-2Z" fill={petal} />
      <path d="M0-10L0-19" stroke="#fff3dc" strokeWidth="1.5" opacity=".55" strokeLinecap="round" />
    </g>)}
    <circle cy="1" r="9" fill="#c79550" /><circle cy="-1" r="8" fill="#f2d18b" />
    <g fill="#b78749"><circle cx="-3" cy="-3" r="1.2" /><circle cx="3" cy="-2" r="1.2" /><circle cy="3" r="1.2" /></g>
  </g>;
}

function TerrainShape({ kind, id }: { kind: ForestTerrainKind; id: string }): ReactNode {
  const paint = (name: string) => `url(#${id}-${name})`;
  switch (kind) {
    case "TREE": return <>
      <ellipse cx="101" cy="128" rx="38" ry="10" fill="#648060" opacity=".2" />
      <path d="M90 89L103 87L107 117Q108 126 119 131Q106 135 101 128Q95 138 83 133Q94 125 93 116Z" fill={paint("bark")} />
      <path d="M97 109L80 90M100 105L119 83" fill="none" stroke="#9c7952" strokeWidth="7" strokeLinecap="round" />
      <path d="M98 112L100 127M102 119L109 129" fill="none" stroke="#dfbb83" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M52 82C39 64 51 43 68 43C69 23 95 19 110 30C133 21 151 40 143 57C162 65 158 91 139 96C122 111 104 102 97 99C77 111 52 101 52 82Z" fill={paint("foliage")} />
      <path d="M55 79Q56 102 80 99Q90 99 97 93Q120 105 134 92Q150 89 150 73" fill="none" stroke="#638963" strokeWidth="3" opacity=".45" strokeLinecap="round" />
      <path d="M60 59Q59 45 74 46Q76 29 94 32M112 36Q132 32 136 48" fill="none" stroke="#d7e3b4" strokeWidth="3.5" strokeLinecap="round" />
      <g fill="#d3dda6"><path d="M73 65Q60 59 64 52Q76 53 73 65ZM99 50Q89 42 96 36Q106 39 99 50ZM123 80Q124 65 136 68Q135 80 123 80Z" /></g>
      <g fill="#78996a"><path d="M92 82Q83 66 97 65Q102 76 92 82ZM117 60Q108 52 114 45Q125 49 117 60Z" /></g>
      <g fill="#e9bd7e"><circle cx="68" cy="83" r="3" /><circle cx="75" cy="87" r="2.5" /><circle cx="134" cy="57" r="3" /></g>
      <Sprig x={70} y={124} scale={.7} rotate={-18} /><Sprig x={127} y={132} scale={.6} rotate={24} />
      <g fill="#f8efd0"><circle cx="65" cy="126" r="2" /><circle cx="117" cy="137" r="2" /><circle cx="125" cy="138" r="1.5" /></g>
    </>;
    case "WATER": return <>
      {/* A recessed pond following the top plane, with a visible warm clay rim. */}
      <path d="M50 97C56 81 83 80 96 88C109 96 128 80 147 97C165 110 147 126 124 128C107 130 104 143 80 136C60 132 37 113 50 97Z" fill="#91a894" />
      <path d="M52 99C60 85 83 84 96 92C111 99 128 86 146 101C158 112 143 123 122 124C104 126 104 138 81 132C63 128 42 111 52 99Z" fill={paint("water")} />
      <path d="M52 97C57 82 83 81 97 89C109 96 130 81 147 98" stroke="#f8ebc9" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M59 101Q69 91 85 95M94 128Q110 122 119 122M125 100Q137 98 144 107" stroke="#deefe2" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="88" cy="110" rx="20" ry="7" stroke="#d3e8d9" strokeWidth="1.2" fill="none" opacity=".8" />
      <path d="M72 108C66 95 95 94 104 105L89 108L100 112C91 118 75 117 72 108Z" fill="#73996f" />
      <path d="M76 104Q83 99 93 102" stroke="#b9ce93" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <g transform="translate(83 101)"><path d="M0 1Q-14-2-9-10Q-2-10 0-3Q1-13 5-13Q12-6 5-1Q13-7 16-2Q13 6 2 4Z" fill="#f3cebb" /><path d="M0 1Q-2-7 4-10Q9-3 3 2Z" fill="#fff0d7" /><ellipse cx="3" cy="3" rx="5" ry="2" fill="#d8aa62" /></g>
      <g fill="#c3bca5"><ellipse cx="52" cy="116" rx="8" ry="5" /><ellipse cx="61" cy="126" rx="5" ry="3.5" /><ellipse cx="145" cy="92" rx="7" ry="4" /></g>
      <path d="M48 115Q51 111 56 114M143 90L147 91" stroke="#f2e7c9" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M133 88L132 62M139 89L143 70" stroke="#7e966a" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M132 72L132 60M142 79L144 69" stroke="#a78350" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M127 87Q124 71 119 73Q123 84 127 87" fill="#a0b681" />
      <circle cx="116" cy="109" r="1.7" fill="#eef7e9" />
    </>;
    case "FLOWER": return <>
      <ellipse cx="99" cy="129" rx="39" ry="10" fill="#879766" opacity=".2" />
      <path d="M81 131Q84 103 79 71M110 134Q107 101 125 87M97 132Q103 88 106 58" stroke="#75905f" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <Sprig x={82} y={130} scale={1.1} rotate={-30} /><Sprig x={112} y={134} scale={1.1} rotate={25} />
      <path d="M96 113Q79 105 89 92Q101 96 96 113M109 100Q116 84 123 94Q121 104 109 100" fill="#b0c08a" />
      <Blossom x={106} y={58} scale={.64} petal="#f7eacc" />
      <Blossom x={79} y={77} scale={1} petal={paint("petal")} />
      <Blossom x={128} y={94} scale={.7} petal="#f7e9c9" />
      <path d="M62 127L57 110" stroke="#839b6b" strokeWidth="2" /><ellipse cx="56" cy="106" rx="5" ry="7" fill="#ce8f7d" transform="rotate(-18 56 106)" /><path d="M53 108L59 106" stroke="#eed0a5" strokeWidth="1.5" strokeLinecap="round" />
      <g fill="#fff0c9"><circle cx="87" cy="137" r="2.5" /><circle cx="118" cy="141" r="2" /><circle cx="124" cy="138" r="1.5" /></g>
    </>;
    case "ROCK": return <>
      <ellipse cx="102" cy="131" rx="48" ry="10" fill="#777f70" opacity=".2" />
      <path d="M82 109L85 79Q85 73 93 68L113 57Q119 55 125 62L147 85Q151 90 149 97L144 116Q139 125 125 124Z" fill={paint("stone")} />
      <path d="M88 80L116 62Q120 59 123 64L143 86L118 91Z" fill="#d9dbce" />
      <path d="M118 91L143 86L147 96L140 116L122 120Z" fill="#929f98" />
      <path d="M93 80L112 69M125 65L137 79" stroke="#f0eddb" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M48 122L54 101Q55 97 62 94L81 90Q90 90 95 99L105 124Q104 132 94 135L68 138Q51 134 48 122Z" fill={paint("stone")} />
      <path d="M56 103L77 95Q85 91 90 99L96 111L74 114Z" fill="#ccd1c1" />
      <path d="M74 114L96 111L103 125L95 132L72 135Z" fill="#9ca79c" />
      <path d="M65 102L76 99M86 118L90 124" stroke="#ede9d6" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M118 130Q112 118 125 115Q139 111 147 123Q151 137 130 139Z" fill="#b5bcb0" />
      <path d="M124 120Q134 115 140 122" stroke="#e2e3d0" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M83 129Q78 122 70 127Q62 124 59 132Q66 141 83 137Q96 140 96 134Q92 128 83 129Z" fill="#8b9e6b" />
      <g fill="#bac690"><circle cx="68" cy="131" r="2" /><circle cx="79" cy="132" r="2.5" /><circle cx="86" cy="135" r="1.5" /></g>
      <Sprig x={149} y={123} scale={.8} rotate={20} /><Sprig x={105} y={137} scale={.55} rotate={-17} />
      <g fill="#7a887a" opacity=".55"><circle cx="105" cy="96" r="1" /><circle cx="101" cy="99" r="1" /><circle cx="60" cy="119" r="1" /><circle cx="65" cy="121" r="1" /></g>
    </>;
    case "MUSHROOM": return <>
      <ellipse cx="100" cy="133" rx="43" ry="9" fill="#8a8661" opacity=".22" />
      <path d="M82 76L79 116Q77 129 72 132Q94 143 112 130Q101 113 104 77Z" fill={paint("stem")} />
      <path d="M85 100Q84 119 81 127M98 109L101 125" stroke="#cdb993" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <ellipse cx="92" cy="83" rx="45" ry="14" fill="#ecd3b0" />
      <path d="M55 84L79 86M62 91L81 88M76 95L86 89M108 89L120 94M109 85L131 85M106 88L128 91" stroke="#bd957d" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M46 80C48 62 64 34 91 33C118 30 137 59 140 78C139 88 112 87 92 85C73 85 47 90 46 80Z" fill={paint("cap")} />
      <path d="M51 80Q63 85 89 81Q120 86 136 79" stroke="#f2bd99" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M59 60Q67 43 85 40" stroke="#f3c5a2" strokeWidth="3" fill="none" strokeLinecap="round" />
      <g fill="#f9e8c9"><ellipse cx="72" cy="64" rx="8" ry="5" transform="rotate(-22 72 64)" /><ellipse cx="103" cy="49" rx="6" ry="4" transform="rotate(16 103 49)" /><ellipse cx="119" cy="71" rx="8" ry="5" transform="rotate(18 119 71)" /><ellipse cx="94" cy="76" rx="4" ry="2.5" /></g>
      <path d="M130 108L128 132Q136 138 144 132L140 108Z" fill={paint("stem")} />
      <ellipse cx="135" cy="110" rx="22" ry="7" fill="#e6c3a0" />
      <path d="M113 108Q117 84 136 84Q153 86 157 108Q142 115 113 108Z" fill={paint("cap")} />
      <path d="M121 99Q125 90 134 90" stroke="#f3c5a2" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="142" cy="102" rx="4" ry="2.5" fill="#f9e8c9" />
      <Sprig x={58} y={129} scale={.8} rotate={-18} /><Sprig x={113} y={141} scale={.6} rotate={20} />
      <path d="M68 139Q63 129 53 135Q54 144 68 139" fill="#bca06b" /><path d="M56 137L65 139" stroke="#e8d19c" strokeWidth="1.2" />
    </>;
  }
}

export function ForestTerrainArt({ kind, decorative = false, className }: { kind: ForestTerrainKind; decorative?: boolean; className?: string }) {
  const id = useId();
  const terrain = FOREST_TERRAIN_ART[kind];
  return <svg className={className} width="200" height="200" viewBox="0 0 200 200" role={decorative ? undefined : "img"} aria-hidden={decorative || undefined} aria-labelledby={decorative ? undefined : `${id}-title`} focusable="false">
    {!decorative && <title id={`${id}-title`}>{`${terrain.name} 지형 조각`}</title>}
    <defs>
      <linearGradient id={`${id}-tile`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#faf0d3" /><stop offset="1" stopColor={terrain.top} /></linearGradient>
      <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2=".3"><stop stopColor={terrain.side} /><stop offset=".5" stopColor={terrain.top} /><stop offset="1" stopColor={terrain.side} /></linearGradient>
      <linearGradient id={`${id}-foliage`} x1=".2" y1="0" x2=".7" y2="1"><stop stopColor="#bfd49b" /><stop offset=".5" stopColor="#95b47c" /><stop offset="1" stopColor="#729868" /></linearGradient>
      <linearGradient id={`${id}-bark`}><stop stopColor="#b08a5a" /><stop offset=".45" stopColor="#c9a26c" /><stop offset="1" stopColor="#93714d" /></linearGradient>
      <linearGradient id={`${id}-water`} x1="0" y1="0" x2=".6" y2="1"><stop stopColor="#77a7a6" /><stop offset=".45" stopColor="#9ec9c1" /><stop offset="1" stopColor="#b8d9ca" /></linearGradient>
      <linearGradient id={`${id}-petal`} x1="0" y1="0" x2=".4" y2="1"><stop stopColor="#f3c3ac" /><stop offset="1" stopColor="#d58f7d" /></linearGradient>
      <linearGradient id={`${id}-stone`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#c6cec0" /><stop offset="1" stopColor="#89968d" /></linearGradient>
      <linearGradient id={`${id}-cap`} x1=".2" y1="0" x2=".6" y2="1"><stop stopColor="#e1a17e" /><stop offset=".6" stopColor="#c87e63" /><stop offset="1" stopColor="#ae6554" /></linearGradient>
      <linearGradient id={`${id}-stem`}><stop stopColor="#f4e4c1" /><stop offset=".55" stopColor="#ead5af" /><stop offset="1" stopColor="#cbb08b" /></linearGradient>
    </defs>
    <ellipse cx="100" cy="166" rx="68" ry="8" fill="#574d3d" opacity=".1" />
    <path d="M25 108L100 70L175 108V122Q175 130 168 134L108 165Q100 169 92 165L33 134Q25 130 25 122Z" fill={`url(#${id}-edge)`} />
    <path d="M100 150V163M34 124L91 153M109 153L166 124" stroke={terrain.side} strokeWidth="1" fill="none" opacity=".55" />
    <path d="M29 104L93 70Q100 66 107 70L171 104Q180 110 171 116L107 151Q100 155 93 151L29 116Q20 110 29 104Z" fill={`url(#${id}-tile)`} />
    <path d="M30 108L94 74Q100 71 106 74L170 108M32 117L94 149Q100 152 106 149L169 117" stroke="#fff7df" strokeWidth="1.5" fill="none" opacity=".65" strokeLinecap="round" />
    <g fill={terrain.side} opacity=".38"><circle cx="44" cy="111" r="1.2" /><circle cx="111" cy="141" r="1" /><circle cx="151" cy="117" r="1.1" /><circle cx="91" cy="145" r="1" /></g>
    <TerrainShape kind={kind} id={id} />
  </svg>;
}
