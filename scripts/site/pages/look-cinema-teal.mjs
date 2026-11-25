import { lookPage } from '../look-page.mjs';

export default lookPage('cinema-teal', {
  zh: {
    what: '冷阴影、暖高光是这支的主结构：暗部被压进青蓝，亮部往红里推一点——推的是红不是黄，所以肤色不会发橙；蓝色被压深、饱和提高。中段先收一档饱和再上色，整体不会腻，冷暖的对比是靠结构撑起来的，不是一味加重。',
    goodFor: ['蓝调时刻的城市天际线', '霓虹和路灯下的夜景人物', '冷色墙面前的暖光人像'],
    differs: '和电影蓝比，电影蓝把蓝色通道整体抬高，整幅画面从头到尾都偏蓝；这支只把冷暖分到阴影和高光，中间调更中性。和电影 709 比，709 的饱和更低、更接近中性，冷暖分割也弱得多。',
  },
  en: {
    what: 'Built on a hard warm-cool split: shadows are pushed into teal-blue, highlights are pushed toward red — red rather than yellow, so skin does not go orange — and blues are darkened and tightened. The middle is desaturated before the cast goes on, so the split works as a structure instead of a heavy filter.',
    goodFor: ['Blue-hour city skylines', 'Neon and lamp-lit night portraits', 'Warm-lit faces against cool walls'],
    differs: 'Cinema Blue lifts the blue channel across the whole frame, so everything reads blue rather than only the shadows; Cinema 709 is lower in saturation and much closer to neutral, with a much weaker warm-cool split.',
  },
});
