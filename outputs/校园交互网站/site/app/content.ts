export const schoolSources = {
  history: {
    title: '淄博教育 2021 工作盘点：淄博齐盛高级中学',
    publisher: '淄博市教育局',
    date: '2022 年 9 月 9 日',
    href: 'https://edu.zibo.gov.cn/gongkai/channel_c_5f9fa491ab327f36e4c1307f_n_1605682699.3632/doc_631aafbf3cc72502c44ee827.html',
  },
  campus: {
    title: '内蒙古包头第九十三中学到齐盛高中交流',
    publisher: '淄博市教育局',
    date: '2024 年 9 月 27 日',
    href: 'https://edu.zibo.gov.cn/art/2024/9/27/art_225_2846994.html',
  },
  publicSchool: {
    title: '淄博齐盛高级中学有关信息',
    publisher: '淄博市教育局',
    date: '2021 年 4 月 7 日',
    href: 'https://edu.zibo.gov.cn/art/2021/4/7/art_3540_2101193.html',
  },
} as const;

export const schoolFacts = {
  name: '淄博齐盛高级中学',
  location: '山东省淄博市张店区',
  type: '公办普通高中',
  newCampusOpened: '2021 年 9 月 1 日',
  philosophy: '见贤思齐，于斯为盛',
} as const;

export const astraSource = {
  title: 'GPT-6 Astra 官方模型文档',
  href: 'https://developers.openai.com/api/docs/models/gpt-6-astra',
} as const;

export const makingStages = [
  {
    id: 'references',
    label: '收集与阅读',
    title: '先从真实的校园出发。',
    body: '照片记录立面与材质，视频补充行走中的连续视角，VR 截图帮助辨认空间之间的关系。把不同来源的线索放在一起，才能逐步理解楼宇、道路与庭院如何相连。',
    note: '项目发起者提供视觉资料与校园记忆，作为重建的起点。',
  },
  {
    id: 'space',
    label: '组织空间',
    title: '让分散的视角连成整体。',
    body: '从校门、教学区到运动场和宿舍庭院，先建立总体布局，再逐步补充楼层、窗格、连廊与道路。Blender 脚本把重复构件组织起来，让空间调整可以持续进行。',
    note: '建筑比例依据可见资料判断，模型尺寸并非实地测绘数据。',
  },
  {
    id: 'calibration',
    label: '核对与校准',
    title: '熟悉这里的人，校正每一次理解。',
    body: '空间关系不能仅凭一张照片确定。熟悉校园的人持续核对模型，指出连廊所在楼层、下沉式圆形空间等细节；Astra 根据反馈修改建模脚本与场景，重新检查画面。',
    note: '每次修正都来自资料与反馈的对照；资料未覆盖的位置仍可能存在偏差。',
  },
  {
    id: 'film',
    label: '镜头与影像',
    title: '从可观看的模型，到有节奏的影片。',
    body: '在 Blender 中安排镜头、光线与材质，以 EEVEE 渲染校园画面，再用 FFmpeg 合成字幕与音乐，并通过 Remotion 制作星光片尾。静态的建筑因此有了观看的顺序，场景也有了停留与转场的节奏。',
    note: '影片中的空间来自三维重建，画面并非校园实拍。',
  },
  {
    id: 'web',
    label: '走向网页',
    title: '把镜头的选择，交还给观看者。',
    body: '在网页中选择分区、自由转动视角，也可以调整光线与天气。南教学楼一至四层提供楼层查看，让观看者继续认识室内的布局。',
    note: '室内依据照片、视频与疏散图重建，尺寸仍需持续校准。',
  },
] as const;
