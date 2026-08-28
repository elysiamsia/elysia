/* 共享时间轴数据源 —— 唯一数据入口（主页面与 armor.html 共用）
   数据来源：米游社圣芙蕾雅档案馆 + B站崩坏3wiki + 用户逐条确认
   约定：type=armor|skin|story|event；real_date 现实日期（YYYY-MM）；version 游戏版本；ingame_time 游戏内时间 */
window.TIMELINE_DATA = [
  // ===== 可玩装甲（3 架）=====
  { id: 'armor-pink',     type: 'armor', title: '粉色妖精小姐♪',    subtitle: 'S级 · 异能 · 物理输出', real_date: '2021-09', version: 'v5.1',  ingame_time: '前文明纪元 · 往世乐土', desc: '初入乐土时与她相遇的那位粉色妖精。', detail: '专武：往事的飞花·爱之诗', audio: null, featured: true,  order: 11 },
  { id: 'armor-ego',      type: 'armor', title: '真我·人之律者',     subtitle: 'S级 · 异能 · 冰伤输出',  real_date: '2025-08', version: 'v6.0',  ingame_time: '前文明纪元 · 两种律者形态', desc: '人之律者与始源之律者两种形态自由切换的她。', detail: '专武：无瑕之眷·册礼', audio: null, featured: true,  order: 12 },
  { id: 'armor-elf',      type: 'armor', title: '嗨♪爱愿妖精♥',     subtitle: 'S级 · 星尘 · 冰冻输出',  real_date: '2025-10', version: 'v8.5',  ingame_time: '黄金庭院', desc: '黄金庭院中再度起舞的妖精。', detail: '专武：澄爱挚语·馨愿', audio: null, featured: true,  order: 13 },

  // ===== 皮肤（5 套）=====
  { id: 'skin-1', type: 'skin', title: '粉色甜心小姐', subtitle: '粉色妖精小姐♪ 皮肤', real_date: null, version: null, ingame_time: null, desc: '甜美的粉色少女心。', detail: null, audio: null, featured: false, order: 21 },
  { id: 'skin-2', type: 'skin', title: '夏日妖精小姐', subtitle: '粉色妖精小姐♪ 皮肤', real_date: null, version: null, ingame_time: null, desc: '在海边度过夏日的妖精。', detail: null, audio: null, featured: false, order: 22 },
  { id: 'skin-3', type: 'skin', title: '褪色妖精小姐', subtitle: '粉色妖精小姐♪ 皮肤', real_date: null, version: null, ingame_time: null, desc: '带着些许故事感的褪色光影。', detail: null, audio: null, featured: false, order: 23 },
  { id: 'skin-4', type: 'skin', title: '春好桃夭',     subtitle: '真我·人之律者 服装',  real_date: null, version: null, ingame_time: null, desc: '春日桃夭，灼灼其华。', detail: null, audio: null, featured: false, order: 24 },
  { id: 'skin-5', type: 'skin', title: '霁月婵娟',     subtitle: '嗨♪爱愿妖精♥ 服装',  real_date: null, version: null, ingame_time: null, desc: '雨霁月明，婵娟千里。', detail: null, audio: null, featured: false, order: 25 },

  // ===== 剧情事件（9 条，游戏内时间线）=====
  { id: 'story-1', type: 'story', title: '降生',     subtitle: '沃斯托克-51', real_date: null, version: null, ingame_time: '前文明纪元初期', desc: '从天而降的「小妖精」在梣树下被发现，被居民送往教堂旁福利院抚养。', detail: null, audio: null, featured: false, order: 1 },
  { id: 'story-2', type: 'story', title: '命名',     subtitle: '月下绘本',     real_date: null, version: null, ingame_time: '前文明纪元初期', desc: '生日收到第一份礼物——童话绘本，在月光下为自己取名「爱莉希雅」。', detail: null, audio: null, featured: false, order: 2 },
  { id: 'story-3', type: 'story', title: '离开',     subtitle: '瑟莉娅的祝福', real_date: null, version: null, ingame_time: '前文明纪元时期', desc: '为不拖累小镇，在「母亲」瑟莉娅的祝福中踏上寻找身世的旅途。', detail: null, audio: null, featured: false, order: 3 },
  { id: 'story-4', type: 'story', title: '游历',     subtitle: '世界舞台',     real_date: null, version: null, ingame_time: '前文明纪元时期', desc: '走遍世界见识人性善恶美丑，仍未寻到梦想中的乐园。', detail: null, audio: null, featured: false, order: 4 },
  { id: 'story-5', type: 'story', title: '逐火',     subtitle: '逐火之蛾',     real_date: null, version: null, ingame_time: '前文明纪元 · 崩坏纪元', desc: '既然找不到乐园，就自己创造一个——加入逐火之蛾成为融合战士。', detail: null, audio: null, featured: false, order: 5 },
  { id: 'story-6', type: 'story', title: '英桀',     subtitle: '逐火十三英桀', real_date: null, version: null, ingame_time: '前文明纪元后期', desc: '「约束的惨剧」后推动编制化，集结十三位英桀、授予位次与刻印。', detail: null, audio: null, featured: false, order: 6 },
  { id: 'story-7', type: 'story', title: '晚宴',     subtitle: '最后一舞',     real_date: null, version: null, ingame_time: '前文明纪元末期', desc: '自曝「第十三律者」身份，将讨伐晚宴布置成盛大宴会，自我消散。', detail: null, audio: null, featured: true,  order: 7 },
  { id: 'story-8', type: 'story', title: '乐土引路人', subtitle: '往世乐土',     real_date: null, version: null, ingame_time: '主线 5.x · 往世乐土', desc: '以记忆体身份成为雷电芽衣的引路人，引导她探寻前文明真相。', detail: null, audio: null, featured: true,  order: 8 },
  { id: 'story-9', type: 'story', title: '归来与谢幕', subtitle: '四朵水晶花',   real_date: null, version: null, ingame_time: '主线 5.x · 乐土结局', desc: '侵蚀之律者删除了她的数据，英桀们以封存的记忆重构她，共灭侵蚀、盛大谢幕。', detail: null, audio: null, featured: true, order: 9 },

  // ===== 活动与版本里程碑 =====
  { id: 'event-1', type: 'event', title: '往世乐土玩法开启', subtitle: '粉色妖精小姐♪ 实装', real_date: '2021-09', version: 'v5.1', ingame_time: null, desc: '往世乐土玩法开放，与她相逢的起始。', detail: null, audio: null, featured: true, order: 31 },
  { id: 'event-2', type: 'event', title: '真我·人之律者实装', subtitle: '装甲上线',          real_date: '2025-08', version: 'v6.0', ingame_time: null, desc: '真我·人之律者 装甲实装。', detail: null, audio: null, featured: false, order: 32 },
  { id: 'event-3', type: 'event', title: '嗨♪爱愿妖精♥ 实装', subtitle: '黄金庭院',         real_date: '2025-10', version: 'v8.5', ingame_time: null, desc: '嗨♪爱愿妖精♥ 装甲实装。', detail: null, audio: null, featured: false, order: 33 },
  { id: 'event-4', type: 'event', title: '她的生日',          subtitle: '11月11日',        real_date: '2025-11', version: null, ingame_time: null, desc: '愿每一份祝福都如飞花般绚丽。', detail: '每年 11 月 11 日，页面右下角有生日倒计时彩蛋。', audio: null, featured: true, order: 99 },
];

// 语录配音映射（1~8 有配音，9、10 无配音静音切换）
window.QUOTE_AUDIO = {
  1: 'audio/01_嗨想我了吗.mp3',
  2: 'audio/02_此后将有群星闪耀.mp3',
  3: 'audio/03_请将我的剑我的花.mp3',
  4: 'audio/04_悲剧并非终结.mp3',
  5: 'audio/05_美丽的女孩子什么都能做到.mp3',
  6: 'audio/06_如你所见与那个凯文齐名.mp3',
  7: 'audio/07_而你将走向未来.mp3',
  8: 'audio/08_愿你前行的道路有群星闪耀.mp3',
};
