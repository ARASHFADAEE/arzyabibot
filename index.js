const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const OpenAI = require('openai');
require('dotenv').config(); // بارگذاری متغیرهای محیطی از فایل .env

// بررسی متغیرهای محیطی
if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.AVALAI_API_KEY) {
    console.error('لطفاً متغیرهای محیطی TELEGRAM_BOT_TOKEN و AVALAI_API_KEY را در فایل .env تعریف کنید.');
    process.exit(1);
}

// توکن بات (از متغیر محیطی)
const token = process.env.TELEGRAM_BOT_TOKEN;

// ایجاد نمونه بات
const bot = new TelegramBot(token, { polling: true });

// فایل JSON برای ذخیره اطلاعات کاربران
const USERS_FILE = './users.json';

// متغیر برای ذخیره وضعیت کاربران (State)
const userStates = {};
const userAssessmentStates = {};

// تعریف شایستگی‌ها
const competencies = [
    "خودآگاهی و خودمدیریتی",
    "صداقت شخصی و قابلیت اطمینان",
    "ارتباطات",
    "روابط و تعاملات",
    "رهبری",
    "کار تیمی",
    "مدیریت تعارض و بحران",
    "مذاکره",
    "نتیجه‌گرایی",
];

// تنظیمات API
const baseURL = "https://api.avalai.ir/v1";
const openai = new OpenAI({
    apiKey: process.env.AVALAI_API_KEY, // کلید API از متغیر محیطی
    baseURL: baseURL,
});

// لیست سوالات اولیه
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
            [{ text: 'شروع ارزیابی 📝', callback_data: 'start_assessment' }],
        ],
    };
    bot.sendMessage(chatId, 'برای شروع فرآیند ارزیابی، روی دکمه زیر کلیک کنید:', {
        reply_markup: keyboard,
    });
}

// تابع برای پردازش خروجی API
function parseQuestion(questionText) {
    const lines = questionText.trim().split('\n');
    let question = '';
    const options = [];
    let isQuestion = true;

    for (const line of lines) {
        if (isQuestion && line.startsWith('سوال:')) {
            question = line.replace('سوال:', '').trim();
            isQuestion = false;
        } else if (line.startsWith('•')) {
            const optionMatch = line.match(/• (\w+)\) (.+) \(امتیاز: (\d+)\)/);
            if (optionMatch) {
                const [, value, text, score] = optionMatch;
                options.push({ text, value, score: parseInt(score) });
            }
        }
    }

    return { question, options };
}

// تابع برای تولید سوال تطبیقی
async function generateQuestion(competency) {
    const systemPrompt = `
        شما یک ارزیاب حرفه‌ای شایستگی مبتنی بر هوش مصنوعی هستید که در زمینه ارزیابی شایستگی‌های رفتاری مدیران پروژه بر اساس استاندارد ICB.4 تخصص دارد.
        وظیفه شما این است که یک سوال چهارگزینه‌ای واقع‌گرایانه و موقعیتی مرتبط با شایستگی "${competency}" طراحی کنید.
        فرمت سوال:
        • سوال باید مرتبط با چالش‌های واقعی مدیریت پروژه باشد.
        • چهار گزینه شامل A و B و C و D طراحی کن.
        • یکی از گزینه‌ها بهترین و مناسب‌ترین پاسخ است که نشان‌دهنده شایستگی بالا (امتیاز ۵) است.
        • دو گزینه نسبتاً مناسب هستند (امتیاز ۳ و ۴).
        • یک گزینه ضعیف‌ترین پاسخ است (امتیاز ۱ یا ۲).

        مثال سوال:
        سوال: یکی از ذینفعان کلیدی با یک تصمیم مهم در پروژه مخالفت کرده است، در حالی که شما معتقدید این تصمیم برای موفقیت پروژه ضروری است. چگونه این وضعیت را مدیریت می‌کنید؟
        • A) نگرانی‌های ذینفع را نادیده بگیر و تصمیم را اجرا کن. (امتیاز: ۱)
        • B) جلسه‌ای ترتیب بده و دلایل این تصمیم را توضیح داده و نگرانی‌های او را بررسی کن. (امتیاز: ۳)
        • C) با گوش دادن فعالانه، اعتراضات او را بررسی کرده و به دنبال یک راه‌حل مشترک باش. (امتیاز: ۵)
        • D) فوراً موضوع را به مدیریت ارشد ارجاع بده. (امتیاز: ۲)

        حالا یک سوال جدید طراحی کن:
    `;

    try {
        const chatCompletion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
            ],
            model: "gpt-3.5-turbo", // اگر Avalai از مدل متفاوتی استفاده می‌کند، نام مدل را تغییر دهید
        });

        const questionText = chatCompletion.choices[0].message.content.trim();
        return parseQuestion(questionText);
    } catch (error) {
        console.error('خطا در تولید سوال:', error.message);
        throw new Error('خطا در تولید سوال. لطفاً بعداً دوباره امتحان کنید.');
    }
}

// تابع برای نمایش سوال با دکمه‌های شیشه‌ای
function showAssessmentQuestion(chatId, questionData, step) {
    const keyboard = {
        inline_keyboard: questionData.options.map(option => [
            { text: `${option.value}) ${option.text}`, callback_data: `answer_${step}_${option.value}` },
        ]),
    };
    bot.sendMessage(chatId, `سوال ${step + 1} از 10:\n${questionData.question}`, { reply_markup: keyboard });
}

// وقتی کاربر دستور /start رو می‌فرسته
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    // پیام خوشامدگویی
    bot.sendMessage(chatId, 'سلام! 👋 به بات ارزیابی شایستگی خوش آمدید.');

    // نمایش دکمه شروع ارزیابی
    showStartAssessmentButton(chatId);
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
            users[chatId] = users[chatId] || {};
            users[chatId].initialData = userStates[chatId].data;
            saveUsers(users);

            // اطلاع‌رسانی پایان سوالات اولیه و شروع ارزیابی شایستگی
            bot.sendMessage(chatId, 'مشخصات شما با موفقیت ثبت شد. حالا ارزیابی شایستگی‌های رفتاری آغاز می‌شود.');
            
            // شروع ارزیابی شایستگی
            userAssessmentStates[chatId] = {
                step: 0,
                competency: competencies[0],
                scores: [],
                questions: [],
            };
            generateQuestion(competencies[0]).then(questionData => {
                userAssessmentStates[chatId].questions.push(questionData);
                showAssessmentQuestion(chatId, questionData, 0);
            }).catch(error => {
                bot.sendMessage(chatId, error.message);
            });
            
            // پاک کردن وضعیت کاربر برای سوالات اولیه
            delete userStates[chatId];
        }
    }
});

// وقتی کاربر روی دکمه شیشه‌ای کلیک می‌کنه
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'start_assessment') {
        // تنظیم وضعیت کاربر به مرحله اول
        userStates[chatId] = { step: 0, data: {} };

        // ارسال سوال اول
        bot.sendMessage(chatId, steps[0].question);
    } else if (data.startsWith('answer_')) {
        // پردازش پاسخ کاربر در ارزیابی شایستگی
        const [_, step, selectedOption] = data.split('_');
        const currentStep = parseInt(step);
        const questionData = userAssessmentStates[chatId].questions[currentStep];
        const selectedOptionData = questionData.options.find(opt => opt.value === selectedOption);

        // ذخیره پاسخ و امتیاز
        userAssessmentStates[chatId].scores.push(selectedOptionData.score);
        userAssessmentStates[chatId].questions[currentStep].selectedOption = selectedOption;
        userAssessmentStates[chatId].questions[currentStep].score = selectedOptionData.score;

        // اگر سوال بعدی وجود دارد
        if (currentStep < 9) { // 10 سوال
            userAssessmentStates[chatId].step += 1;
            const nextCompetency = competencies[(currentStep + 1) % competencies.length]; // انتخاب شایستگی بعدی
            userAssessmentStates[chatId].competency = nextCompetency;
            generateQuestion(nextCompetency).then(questionData => {
                userAssessmentStates[chatId].questions.push(questionData);
                showAssessmentQuestion(chatId, questionData, currentStep + 1);
            }).catch(error => {
                bot.sendMessage(chatId, error.message);
            });
        } else {
            // پایان ارزیابی
            const users = loadUsers();
            users[chatId] = users[chatId] || {};
            users[chatId].assessmentData = {
                totalScore: userAssessmentStates[chatId].scores.reduce((sum, score) => sum + score, 0),
                questionsAnswered: userAssessmentStates[chatId].scores.length,
                competencyScores: competencies.reduce((acc, comp, index) => {
                    acc[comp] = userAssessmentStates[chatId].scores.filter((_, i) => i % competencies.length === index);
                    return acc;
                }, {}),
                questions: userAssessmentStates[chatId].questions,
            };
            saveUsers(users);

            bot.sendMessage(chatId, 'ارزیابی شما به پایان رسید. نتایج در سیستم ذخیره شدند.');
            delete userAssessmentStates[chatId];
        }
    }

    // حذف پیام قبلی (اختیاری، برای تمیزتر شدن چت)
    bot.deleteMessage(chatId, query.message.message_id);
});

console.log('بات با موفقیت اجرا شد!');