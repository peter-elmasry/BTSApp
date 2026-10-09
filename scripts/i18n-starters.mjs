import { readFile, writeFile } from 'node:fs/promises';
// Bootstrap the verbatim glossary from the agreed source, without changing keys.
const plan = await readFile('docs/IMPLEMENTATION_PLAN.md', 'utf8');
const glossary = plan.split('### 14.3')[1].split('### 14.4')[0];
const en = {},
  ar = {};
function put(object, key, value) {
  object[key] = value;
}
for (const line of glossary.split('\n')) {
  const match = line.match(/^\| ([a-z]+\.[\w.]+) \| (.*?) \| (.*?) \|/);
  if (match) {
    put(en, match[1], match[2]);
    put(ar, match[1], match[3]);
  }
}
// Western digits in both languages, as required by §14.1.
ar['errors.LOCKED_OUT'] = ar['errors.LOCKED_OUT'].replace('١٠', '10');
en.app = { title: 'Demiana Sports Team' };
ar.app = { title: 'فريق دميانة الرياضي' };
en.common = {
  switchLanguage: 'Switch to Arabic',
  navigation: 'Main navigation',
  skip: 'Skip to content',
  close: 'Close',
  dismiss: 'Dismiss notification',
  done: 'Done',
};
ar.common = {
  switchLanguage: 'غيّر للإنجليزي',
  navigation: 'القائمة الرئيسية',
  skip: 'روح للمحتوى',
  close: 'اقفل',
  dismiss: 'اقفل الإشعار',
  done: 'تمام',
};
en['errors.REQUIRED'] = 'Please enter a name';
ar['errors.REQUIRED'] = 'اكتب الاسم الأول';
en.foundation = {
  welcome: 'Welcome to DST',
  message: 'One team. One spirit. Get ready for a day of teamwork, friendship and sport.',
  components: 'Your event starts here',
  demo: 'Try the controls while we get the event ready.',
  name: 'Display name',
  emblem: 'Emblem',
  falcon: 'Falcon',
  star: 'Star',
  avatar: 'Falcon emblem',
  notifications: 'Preview notifications',
  preview: 'Preview',
  previewMessage: 'Your preview is ready. Event registration will be available soon.',
  saved: 'Preview complete',
  upcoming: 'We’re getting this page ready for event day.',
};
ar.foundation = {
  welcome: 'أهلاً بيكم في DST',
  message: 'فريق واحد. روح واحدة. استعدوا ليوم كله تعاون وصحوبية ورياضة.',
  components: 'يومكم بيبدأ من هنا',
  demo: 'جرّبوا الاختيارات لحد ما الإيفنت يجهز.',
  name: 'الاسم',
  emblem: 'الرمز',
  falcon: 'صقر',
  star: 'نجمة',
  avatar: 'رمز الصقر',
  notifications: 'جرّب الإشعارات',
  preview: 'معاينة',
  previewMessage: 'المعاينة جاهزة. التسجيل في الإيفنت هيكون متاح قريب.',
  saved: 'المعاينة خلصت',
  upcoming: 'بنجهّز الصفحة دي ليوم الإيفنت.',
};
for (const [lang, data] of [
  ['en', en],
  ['ar', ar],
])
  await writeFile(`public/i18n/${lang}.json`, JSON.stringify(data, null, 2) + '\n');
