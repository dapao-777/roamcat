/**
 * @file extension/pet-quotes.js
 * 文件职责：伴读猫哲学语录库（classic script，禁 ESM）——内置中英对照的精选哲学短句，
 *   供 floating-pet.js 按固定间隔在语音气泡中展示。
 * 主要内容：globalThis.RoamCatPetQuotes = {list, next}；list 为 {zh,en,author} 条目
 *   （仅收录出处明确、归属可靠的名句，zh ≤34 字符、en ≤90 字符以适配气泡）；
 *   next(state) 以洗牌序循环取句，state={order,cursor} 可跨调用持久化，
 *   洗牌用 Math.random Fisher-Yates，保证整轮不重复且跨轮不连续重复同一句。
 * 模块边界：无 import、无浏览器 API 依赖，页面与 Node vm 中均可求值（供单测）；
 *   必须保持非 ESM（module-graph R1 强制）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
(() => {
  'use strict';

  const list = [
    // —— 先秦诸子 ——
    {zh:'学而不思则罔，思而不学则殆。', en:'Learning without thought is labor lost; thought without learning is perilous.', author:'孔子 Confucius'},
    {zh:'三人行，必有我师焉。', en:'When three people walk together, one of them can be my teacher.', author:'孔子 Confucius'},
    {zh:'己所不欲，勿施于人。', en:'Do not impose on others what you do not wish for yourself.', author:'孔子 Confucius'},
    {zh:'知之为知之，不知为不知，是知也。', en:'To know what you know and admit what you do not — that is knowledge.', author:'孔子 Confucius'},
    {zh:'君子坦荡荡，小人长戚戚。', en:'The noble-hearted are calm; the small-minded are always anxious.', author:'孔子 Confucius'},
    {zh:'逝者如斯夫，不舍昼夜。', en:'It flows on like this river, ceasing neither day nor night.', author:'孔子 Confucius'},
    {zh:'岁寒，然后知松柏之后凋也。', en:'Only in cold winter do we see that pines and cypresses fade last.', author:'孔子 Confucius'},
    {zh:'道可道，非常道。', en:'The Dao that can be spoken is not the eternal Dao.', author:'老子 Laozi'},
    {zh:'上善若水，水善利万物而不争。', en:'The highest good is like water, benefiting all yet contending with none.', author:'老子 Laozi'},
    {zh:'知人者智，自知者明。', en:'Knowing others is wisdom; knowing yourself is enlightenment.', author:'老子 Laozi'},
    {zh:'千里之行，始于足下。', en:'A journey of a thousand miles begins with a single step.', author:'老子 Laozi'},
    {zh:'祸兮福之所倚，福兮祸之所伏。', en:'Misfortune is what fortune leans upon; fortune hides misfortune.', author:'老子 Laozi'},
    {zh:'知足者富。', en:'Those who know contentment are rich.', author:'老子 Laozi'},
    {zh:'吾生也有涯，而知也无涯。', en:'Our life has a limit, but knowledge has none.', author:'庄子 Zhuangzi'},
    {zh:'子非鱼，安知鱼之乐？', en:'You are not a fish; how can you know the fish are happy?', author:'庄子 Zhuangzi'},
    {zh:'不知周之梦为蝶与，蝶之梦为周与？', en:'Did Zhuang Zhou dream he was a butterfly, or did the butterfly dream him?', author:'庄子 Zhuangzi'},
    {zh:'井蛙不可以语于海者，拘于虚也。', en:'You cannot discuss the ocean with a well-frog, bound by its dwelling.', author:'庄子 Zhuangzi'},
    {zh:'哀莫大于心死。', en:'No sorrow is greater than the death of the heart.', author:'庄子 Zhuangzi'},
    {zh:'知彼知己，百战不殆。', en:'Know the enemy and yourself, and a hundred battles hold no peril.', author:'孙子 Sun Tzu'},
    {zh:'兵者，诡道也。', en:'All warfare is based on deception.', author:'孙子 Sun Tzu'},
    {zh:'兵无常势，水无常形。', en:'As water keeps no constant shape, war keeps no constant condition.', author:'孙子 Sun Tzu'},
    {zh:'知行合一。', en:'Knowledge and action are one.', author:'王阳明 Wang Yangming'},
    {zh:'心外无物，心外无理。', en:'No thing and no principle exist outside the mind.', author:'王阳明 Wang Yangming'},
    {zh:'破山中贼易，破心中贼难。', en:'Easy to rout bandits in the hills; hard to rout them in the heart.', author:'王阳明 Wang Yangming'},
    {zh:'志不立，天下无可成之事。', en:'Without resolve, nothing under heaven can be accomplished.', author:'王阳明 Wang Yangming'},
    // —— 古希腊 ——
    {zh:'未经省察的人生不值得过。', en:'The unexamined life is not worth living.', author:'苏格拉底 Socrates'},
    {zh:'我唯一知道的，就是我一无所知。', en:'All I know is that I know nothing.', author:'苏格拉底 Socrates'},
    {zh:'认识你自己。', en:'Know thyself.', author:'苏格拉底 Socrates'},
    {zh:'惊奇是哲学家的感受，哲学始于惊奇。', en:'Wonder is the feeling of a philosopher; philosophy begins in wonder.', author:'柏拉图 Plato'},
    {zh:'智者开口因为有话要说，愚者因为不得不说。', en:'Wise men speak having something to say; fools, having to say something.', author:'柏拉图 Plato'},
    {zh:'开始是工作最重要的部分。', en:'The beginning is the most important part of the work.', author:'柏拉图 Plato'},
    {zh:'求知是人类的天性。', en:'All men by nature desire to know.', author:'亚里士多德 Aristotle'},
    {zh:'教育的根是苦的，果实是甜的。', en:'The roots of education are bitter, but the fruit is sweet.', author:'亚里士多德 Aristotle'},
    {zh:'幸福取决于我们自己。', en:'Happiness depends upon ourselves.', author:'亚里士多德 Aristotle'},
    {zh:'希望是醒着的梦。', en:'Hope is a waking dream.', author:'亚里士多德 Aristotle'},
    {zh:'人不能两次踏进同一条河流。', en:'No man ever steps in the same river twice.', author:'赫拉克利特 Heraclitus'},
    {zh:'万物流转，无物常驻。', en:'Everything flows; nothing stands still.', author:'赫拉克利特 Heraclitus'},
    {zh:'性格即命运。', en:'Character is destiny.', author:'赫拉克利特 Heraclitus'},
    {zh:'上坡路与下坡路是同一条路。', en:'The way up and the way down are one and the same.', author:'赫拉克利特 Heraclitus'},
    // —— 斯多葛 ——
    {zh:'我们并非时间太少，而是浪费太多。', en:'It is not that we have little time, but that we waste much.', author:'塞涅卡 Seneca'},
    {zh:'想象之苦，多于现实之苦。', en:'We suffer more in imagination than in reality.', author:'塞涅卡 Seneca'},
    {zh:'等待生活时，生活已流逝。', en:'While we wait for life, life passes.', author:'塞涅卡 Seneca'},
    {zh:'困扰人的不是事情，而是对事情的看法。', en:'We are disturbed not by things, but by our views of them.', author:'爱比克泰德 Epictetus'},
    {zh:'先想好要成为什么人，再做该做的事。', en:'First say what you would be; then do what you have to do.', author:'爱比克泰德 Epictetus'},
    {zh:'不能主宰自己的人不是自由人。', en:'No one is free who is not master of himself.', author:'爱比克泰德 Epictetus'},
    {zh:'生活的幸福取决于思想的品质。', en:'The happiness of your life depends on the quality of your thoughts.', author:'马可·奥勒留 Marcus Aurelius'},
    {zh:'挡路的障碍，恰好成了路。', en:'What stands in the way becomes the way.', author:'马可·奥勒留 Marcus Aurelius'},
    {zh:'最好的报复，是不像伤害你的人。', en:'The best revenge is to be unlike the one who harmed you.', author:'马可·奥勒留 Marcus Aurelius'},
    {zh:'灵魂会染上思想的色彩。', en:'The soul becomes dyed with the color of its thoughts.', author:'马可·奥勒留 Marcus Aurelius'},
    {zh:'幸福的生活所需甚少。', en:'Very little is needed to make a happy life.', author:'马可·奥勒留 Marcus Aurelius'},
    // —— 理性主义与德国古典 ——
    {zh:'我思故我在。', en:'I think, therefore I am.', author:'笛卡尔 Descartes'},
    {zh:'光有头脑不够，关键是善用它。', en:'A good mind is not enough; the point is to use it well.', author:'笛卡尔 Descartes'},
    {zh:'读好书如同与最高尚的人交谈。', en:'Reading good books is like talking with the finest minds.', author:'笛卡尔 Descartes'},
    {zh:'一切卓越都既稀有又困难。', en:'All things excellent are as difficult as they are rare.', author:'斯宾诺莎 Spinoza'},
    {zh:'不嘲笑，不哀叹，不憎恨，但求理解。', en:'Not to laugh, not to weep, not to hate — but to understand.', author:'斯宾诺莎 Spinoza'},
    {zh:'幸福不是德性的报酬，而是德性本身。', en:'Blessedness is not the reward of virtue, but virtue itself.', author:'斯宾诺莎 Spinoza'},
    {zh:'凡存在皆有充足理由。', en:'Nothing happens without a sufficient reason.', author:'莱布尼茨 Leibniz'},
    {zh:'现在孕育着未来。', en:'The present is pregnant with the future.', author:'莱布尼茨 Leibniz'},
    {zh:'要敢于运用你自己的理智。', en:'Dare to use your own understanding.', author:'康德 Kant'},
    {zh:'头顶的星空与心中的道德律令人敬畏。', en:'The starry heavens above and the moral law within fill me with awe.', author:'康德 Kant'},
    {zh:'只按能成普遍法则的准则行动。', en:'Act only on maxims you can will to be universal laws.', author:'康德 Kant'},
    {zh:'人性这根曲木，造不出笔直的东西。', en:'Out of the crooked timber of humanity nothing straight is made.', author:'康德 Kant'},
    {zh:'天才击中别人看不见的目标。', en:'Genius hits a target no one else can see.', author:'叔本华 Schopenhauer'},
    {zh:'真理先被嘲笑，再被反对，终被接受。', en:'Truth is first ridiculed, then opposed, then accepted as obvious.', author:'叔本华 Schopenhauer'},
    {zh:'幸福的两大敌人是痛苦与无聊。', en:'Pain and boredom are the two enemies of human happiness.', author:'叔本华 Schopenhauer'},
    {zh:'凡不能杀死我的，使我更强大。', en:'What does not kill me makes me stronger.', author:'尼采 Nietzsche'},
    {zh:'知道为何而活，便能承受任何活法。', en:'He who has a why to live can bear almost any how.', author:'尼采 Nietzsche'},
    {zh:'凝视深渊过久，深渊将回以凝视。', en:'Gaze long into an abyss, and the abyss also gazes into you.', author:'尼采 Nietzsche'},
    {zh:'没有事实，只有诠释。', en:'There are no facts, only interpretations.', author:'尼采 Nietzsche'},
    {zh:'成为你自己。', en:'Become who you are.', author:'尼采 Nietzsche'},
    {zh:'生活只能倒着理解，却要正着活。', en:'Life can only be understood backwards, but must be lived forwards.', author:'克尔凯郭尔 Kierkegaard'},
    {zh:'最常见的绝望是不做自己。', en:'The most common despair is not being who you are.', author:'克尔凯郭尔 Kierkegaard'},
    {zh:'给我贴上标签，你就否定了我。', en:'Once you label me, you negate me.', author:'克尔凯郭尔 Kierkegaard'},
    // —— 现代 ——
    {zh:'语言的界限即世界的界限。', en:'The limits of my language mean the limits of my world.', author:'维特根斯坦 Wittgenstein'},
    {zh:'对不可说的东西必须沉默。', en:'Whereof one cannot speak, thereof one must be silent.', author:'维特根斯坦 Wittgenstein'},
    {zh:'狮子若能说话，我们也听不懂。', en:'If a lion could talk, we could not understand him.', author:'维特根斯坦 Wittgenstein'},
    {zh:'蠢人笃定，智者存疑。', en:'The stupid are cocksure; the intelligent are full of doubt.', author:'罗素 Russell'},
    {zh:'别怕观点古怪，公认的观点都曾古怪。', en:'Do not fear eccentric opinion; every accepted idea was once eccentric.', author:'罗素 Russell'},
    {zh:'严冬深处，我身上有个不可战胜的夏天。', en:'In the depth of winter I found an invincible summer within me.', author:'加缪 Camus'},
    {zh:'必须想象西西弗是幸福的。', en:'One must imagine Sisyphus happy.', author:'加缪 Camus'},
    {zh:'向高处的挣扎本身足以填满人心。', en:'The struggle toward the heights is enough to fill a heart.', author:'加缪 Camus'},
    {zh:'我反抗，故我们在。', en:'I rebel — therefore we are.', author:'加缪 Camus'},
    {zh:'存在先于本质。', en:'Existence precedes essence.', author:'萨特 Sartre'},
    {zh:'人是被判定为自由的。', en:'Man is condemned to be free.', author:'萨特 Sartre'},
    {zh:'他人即地狱。', en:'Hell is other people.', author:'萨特 Sartre'},
    // —— 东方诗哲 ——
    {zh:'伤口是光进入你内心的地方。', en:'The wound is the place where the light enters you.', author:'鲁米 Rumi'},
    {zh:'你所寻找的，也在寻找你。', en:'What you seek is seeking you.', author:'鲁米 Rumi'},
    {zh:'对与错之外有一片田野，我在那里等你。', en:'Beyond right and wrong there is a field; I will meet you there.', author:'鲁米 Rumi'},
    {zh:'卖掉你的聪明，买来惊奇。', en:'Sell your cleverness and buy bewilderment.', author:'鲁米 Rumi'},
    {zh:'生如夏花之绚烂，死如秋叶之静美。', en:'Let life be beautiful like summer flowers, death like autumn leaves.', author:'泰戈尔 Tagore'},
    {zh:'蝴蝶不数月份只数刹那，因而光阴足够。', en:'The butterfly counts moments, not months, and has time enough.', author:'泰戈尔 Tagore'},
    {zh:'因错过太阳流泪的人，也将错过群星。', en:'If you shed tears for missing the sun, you also miss the stars.', author:'泰戈尔 Tagore'},
    {zh:'站着凝视水面，永远渡不过大海。', en:'You cannot cross the sea by staring at the water.', author:'泰戈尔 Tagore'},
  ];

  /** Fisher-Yates 洗牌，返回 0..length-1 的随机排列。 */
  function shuffledOrder(length) {
    const order = Array.from({length}, (_unused, index) => index);
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = order[i];
      order[i] = order[j];
      order[j] = swap;
    }
    return order;
  }

  /** 校验持久化 state.order 是否为完整的索引排列（损坏/缺号即视为无效需重洗）。 */
  function isPermutation(order, length) {
    if (!Array.isArray(order) || order.length !== length) return false;
    const seen = new Set();
    for (const index of order) {
      if (!Number.isInteger(index) || index < 0 || index >= length || seen.has(index)) return false;
      seen.add(index);
    }
    return true;
  }

  /**
   * 取下一条语录。state={order,cursor} 均可缺省（视为全新一轮）；order 非合法排列或
   * cursor 越界时重新洗牌并回到 0。返回值 {quote, order, cursor} 可直接作为下一次的 state
   * （floating-pet.js 持久化到 chrome.storage.local 的 petQuoteState 以实现跨标签页共享顺序）。
   * 保证同一进程内连续两次调用不会返回同一句（含跨轮交接）。
   */
  function next(state) {
    const total = list.length;
    if (!total) return {quote: null, order: [], cursor: 0};
    const prev = state && typeof state === 'object' ? state : {};
    let order = isPermutation(prev.order, total) ? prev.order.slice() : null;
    let cursor = Number.isInteger(prev.cursor) ? Math.max(0, prev.cursor) : 0;
    if (!order || cursor >= order.length) {
      // 上一轮的最后一句（若可推知）不得作为新一轮的首句，否则连续两次会重复。
      const lastShown = order && order.length ? order[Math.min(cursor, order.length) - 1] : undefined;
      order = shuffledOrder(total);
      if (total > 1 && order[0] === lastShown) {
        const swapAt = 1 + Math.floor(Math.random() * (total - 1));
        const swap = order[0];
        order[0] = order[swapAt];
        order[swapAt] = swap;
      }
      cursor = 0;
    }
    return {quote: list[order[cursor]], order, cursor: cursor + 1};
  }

  globalThis.RoamCatPetQuotes = {list, next};
})();
