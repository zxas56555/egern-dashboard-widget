// A minimal Egern widget: no HTTP requests, storage, SVG or helper imports.
export default async function (ctx) {
  return {
    type: 'widget',
    padding: 16,
    gap: 10,
    backgroundColor: '#174F39',
    children: [
      {
        type: 'text',
        text: '自检成功',
        font: { size: 'title2', weight: 'bold' },
        textColor: '#FFFFFF',
      },
      {
        type: 'text',
        text: '模块脚本已执行',
        font: { size: 'caption1' },
        textColor: '#FFFFFF',
      },
      {
        type: 'text',
        text: `Egern ${ctx.app?.version || '未知版本'}`,
        font: { size: 'caption1' },
        textColor: '#FFFFFF',
      },
    ],
  };
}
