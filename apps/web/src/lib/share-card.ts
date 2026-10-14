import { dayText } from './api';
export async function shareCard(trip: {
  assets: { url: string }[];
  waterName: string;
  createdAt: string;
  fish: string[];
}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 1300;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f4f5ef';
  ctx.fillRect(0, 0, 1000, 1300);
  ctx.fillStyle = '#194f40';
  ctx.font = 'bold 42px sans-serif';
  ctx.fillText('钓鱼真探', 60, 90);
  ctx.font = '22px sans-serif';
  ctx.fillText('每次出发，都有发现。', 60, 135);
  if (trip.assets[0]) {
    const image = new Image();
    image.src = trip.assets[0].url;
    await image.decode();
    const ratio = Math.min(880 / image.width, 780 / image.height);
    const w = image.width * ratio,
      h = image.height * ratio;
    ctx.drawImage(image, 60 + (880 - w) / 2, 190 + (780 - h) / 2, w, h);
  }
  ctx.fillStyle = '#194f40';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText(trip.waterName.slice(0, 20), 60, 1040);
  ctx.font = '26px sans-serif';
  ctx.fillText(dayText(trip.createdAt) + ' · ' + (trip.fish.join(' / ') || '一次真实出钓'), 60, 1100);
  ctx.font = '22px sans-serif';
  ctx.fillStyle = '#6c786d';
  ctx.fillText('点亮黔中水 · 收藏水边的故事', 60, 1210);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('分享卡生成失败'))),
      'image/jpeg',
      0.92,
    ),
  );
  const file = new File([blob], 'fishing-story.jpg', { type: 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: '我的出钓故事' });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
