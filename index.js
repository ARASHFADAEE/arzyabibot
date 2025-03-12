const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// توکن بات رو اینجا وارد کنید (از BotFather گرفتید)
const token = '7617713180:AAH28SHiDeToxmArp_JrzkN2gQjuYtygmvM';

// ایجاد نمونه بات
const bot = new TelegramBot(token, { polling: true });

// فایل JSON برای ذخیره اطلاعات کاربران
const USERS_FILE = './users.json';

// متغیر برای ذخیره وضعیت کاربران (State)
const userStates = {};

// لیست سوالات و مراحل
const steps = [
  { id: 'fullName', question: 'نام و نام خانوادگی خود را وارد کنید:' },
  { id: 'age', question: 'سن خود را وارد کنید:' },
  { id: 'education', question: 'تحصیلات خود را وارد کنید (کارشناسی، ارشد، دکتری):' },
  { id: 'projectManagementKnowledge', question: 'آشنایی با دانش و استانداردهای مدیریت پروژه (بسیار، متوسط، کم):' },
  { id: 'certificate', question: 'گواهینامه بین‌المللی (در صورت وجود):' },
  { id: 'organization', question: 'نام سازمان:' },
  { id: 'experience', question: 'سابقه کار مدیریت پروژه (کمتر از 5 سال، کمتر از 10 سال، کمتر از 15 سال، بیش از 15 سال):' },
];

// تابع برای خواندن اطلاعات کاربران از فایل JSON
function loadUsers() {
  if (fs.existsSync(USERS_FILE)) {
    const data = fs.readFileSync(USERS_FILE);
    return JSON.parse(data);
  }
  return {};
}

// تابع برای ذخیره اطلاعات کاربران در فایل JSON
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// تابع برای نمایش دکمه شروع ارزیابی
function showStartAssessmentButton(chatId) {
  const keyboard = {
    inline_keyboard: [
      [{ text: 'شروع ارزیابی شایستگی رفتاری', callback_data: 'start_assessment' }],
    ],
  };
  bot.sendMessage(chatId, 'مشخصات شما با موفقیت ثبت شد. برای شروع ارزیابی، دکمه زیر را فشار دهید:', {
    reply_markup: keyboard,
  });
}

// وقتی کاربر دستور /start رو می‌فرسته
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  // خوشامدگویی
  bot.sendMessage(chatId, 'سلام! به بات ارزیابی شایستگی رفتاری خوش آمدید.\nلطفاً اطلاعات خود را به ترتیب وارد کنید.');

  // تنظیم وضعیت کاربر به مرحله اول
  userStates[chatId] = { step: 0, data: {} };

  // ارسال سوال اول
  bot.sendMessage(chatId, steps[0].question);
});

// وقتی کاربر پیام می‌فرسته
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // اگر پیام /start باشه، نیازی به پردازش نداریم چون قبلاً پردازش شده
  if (text === '/start') return;

  // اگر کاربر هنوز در وضعیت ثبت‌نام هست
  if (userStates[chatId]) {
    const currentStep = userStates[chatId].step;
    const stepData = steps[currentStep];

    // ذخیره پاسخ کاربر
    userStates[chatId].data[stepData.id] = text;

    // اگر هنوز سوال بعدی وجود داره
    if (currentStep < steps.length - 1) {
      userStates[chatId].step += 1;
      bot.sendMessage(chatId, steps[userStates[chatId].step].question);
    } else {
      // تمام سوالات تموم شده، اطلاعات رو ذخیره می‌کنیم
      const users = loadUsers();
      users[chatId] = userStates[chatId].data;
      saveUsers(users);

      // نمایش دکمه شروع ارزیابی
      showStartAssessmentButton(chatId);

      // پاک کردن وضعیت کاربر
      delete userStates[chatId];
    }
  }
});

// وقتی کاربر روی دکمه شیشه‌ای کلیک می‌کنه
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;

  if (query.data === 'start_assessment') {
    bot.sendMessage(chatId, 'ارزیابی شایستگی رفتاری شروع شد! در حال حاضر این بخش در حال توسعه است.');
    // اینجا می‌تونید منطق ارزیابی رو اضافه کنید
  }
});

console.log('بات با موفقیت اجرا شد!');