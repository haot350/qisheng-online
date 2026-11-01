import type {FastifyRequest} from 'fastify';

export function sessionLabel(req?:FastifyRequest) {
  const ua=String(req?.headers['user-agent']??'').slice(0,512);
  if(!ua)return '登录设备';
  const platform=/Android/i.test(ua)?'安卓':/iPhone|iPad|iPod/i.test(ua)?'iOS':/Windows/i.test(ua)?'Windows':/Macintosh|Mac OS/i.test(ua)?'macOS':/Linux/i.test(ua)?'Linux':'其他平台';
  const browser=/QishengOnlineAndroid/i.test(ua)?'齐盛Online':/Edg\//i.test(ua)?'Edge':/Firefox\//i.test(ua)?'Firefox':/Chrome|CriOS/i.test(ua)?'Chrome':/Safari/i.test(ua)?'Safari':'应用';
  return platform+' '+browser;
}
