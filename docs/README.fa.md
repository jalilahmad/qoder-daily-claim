# Qoder Daily Claim

**دریافت خودکار اعتبار روزانه‌ی رایگان Qoder در ویندوز.**

Qoder هر روز به کاربران شخصی **۱۰۰ Credits** می‌دهد، اما باید آن را با یک کلیک در اپ دریافت کنید.
اگر پنجره‌ی دریافت را از دست بدهید، اعتبار آن روز از بین می‌رود. این پروژه همان یک کلیک را
هر روز طبق زمان‌بندی برایتان انجام می‌دهد.

[English](../README.md) · [中文](README.zh-CN.md) · [فارسی](README.fa.md)

---

## این پروژه چه هست و چه نیست

مستندات خود Qoder صریح می‌گوید پاداش روزانه **باید دستی دریافت شود** و API عمومی ندارد. این پروژه
همان یک دریافت دستی را خودکار می‌کند، نه بیشتر: نه اعتبار اضافه جمع می‌کند، نه اکانت می‌سازد،
نه از هیچ محدودیتی دور می‌زند.

> پیش از استفاده، [قوانین رسمی](https://docs.qoder.com/events/100credits) را بخوانید.
> مسئولیت نحوه‌ی استفاده با خودتان است.

## چطور کار می‌کند

Qoder یک اپ Electron است، پس رابط دریافتش محتوای وب است و می‌شود درست هدایتش کرد:

1. **مسیر واقعی UI.** اسکریپت روی دکمه‌ی پروفایل در پایین نوار کناری کلیک می‌کند، بعد روی
   **Rewards center** در منویی که باز می‌شود.
2. **صفحه‌ی کمپین.** این کار
   `https://openapi.qoder.sh/growth-page/activity-iframe` را به‌صورت iframe باز می‌کند که در CDP
   به‌عنوان یک target از نوع `iframe` دیده می‌شود.
3. **دریافت.** اسکریپت داخل همان فریم دکمه‌ی فعال **Claim** روی کارت
   **«Claim 100 Credits Daily»** را پیدا و کلیک می‌کند، بعد تأیید می‌کند که صفحه
   *«Claimed successfully. Credits have been added.»* را نشان می‌دهد.

همه‌چیز داخل نشست واقعی و لاگین‌شده‌ی اپ اجرا می‌شود، پس **هیچ توکن یا کوکی‌ای
خوانده، ذخیره یا ارسال نمی‌شود**.

> **چرا از میان‌بر IPC استفاده نمی‌شود؟** Qoder متد `openCampaignSurface()` را روی پل IPC
> در اختیار می‌گذارد و نسخه‌ی اولیه‌ی همین پروژه از آن استفاده می‌کرد. ولی آن مسیر صفحه را
> برای همیشه روی *«Connecting to Qoder Desktop…»* گیر می‌اندازد، چون پل میزبان فقط وقتی
> وصل می‌شود که پنجره از منوی واقعی باز شود. پس اسکریپت منو را هدایت می‌کند، دقیقاً مثل یک آدم.

```
دکمه پروفایل  ──►  «Rewards center»  ──►  iframe کمپین
                                              │
                                              ▼
                               یافتن کارت روزانه → کلیک Claim
                                              ▼
                               تأیید «Claimed successfully» → ثبت در لاگ
```

## پیش‌نیازها

- **ویندوز ۱۰ یا ۱۱** (زمان‌بندی از Task Scheduler و PowerShell استفاده می‌کند)
- **Node.js نسخه ۱۸ یا بالاتر** — [nodejs.org](https://nodejs.org) (با `node --version` بررسی کنید)
- **اپ دسکتاپ Qoder**، نصب‌شده و لاگین‌شده

## نصب

```powershell
git clone https://github.com/jalilahmad/qoder-daily-claim.git
cd qoder-daily-claim

# ثبت تسک زمان‌بندی‌شده‌ی روزانه
powershell -ExecutionPolicy Bypass -File scripts/install-task.ps1
```

نصب‌کننده زمان درست را برای منطقه‌ی زمانی شما حساب می‌کند. پنجره‌ی دریافت Qoder ساعت
**۱۰:۰۰ به وقت سنگاپور (UTC+8)** باز می‌شود و تسک ۱۵ دقیقه بعد از آن، به وقت محلی خودتان، تنظیم می‌شود.

نمونه‌ی خروجی:

```
Computed local claim time: 06:45 (10:15 UTC+8 in your timezone)

Registered scheduled task: Qoder Daily Credit Claim
  Runs daily at 06:45 (local), retrying hourly for 4 hours.
```

## استفاده

### اجرای فوری

```powershell
# همین حالا دریافت کن، بعد Qoder را ببند
powershell -ExecutionPolicy Bypass -File scripts/run-claim.ps1

# همین حالا دریافت کن، Qoder باز بماند
powershell -ExecutionPolicy Bypass -File scripts/run-claim.ps1 -KeepOpen
```

### دیدن نتیجه

```powershell
Get-Content claim-log.txt -Tail 20
```

یک اجرای موفق این‌طور است:

```
[2026-11-16T02:45:12.331Z] --- run start ---
[2026-11-16T02:45:13.104Z] status: claimable=true url=https://openapi.qoder.sh/growth-page/activity-iframe
[2026-11-16T02:45:13.882Z] open surface: {"ok":true}
[2026-11-16T02:45:16.220Z] campaign frame: https://openapi.qoder.sh/growth-page/activity-iframe
[2026-11-16T02:45:18.004Z] click: {"clicked":true,"via":"daily-card","label":"claim"}
[2026-11-16T02:45:25.117Z] post-status: claimable=false
[2026-11-16T02:45:25.118Z] RESULT: claim succeeded
```

### مدیریت تسک

```powershell
# وضعیت و نتیجه‌ی آخرین اجرا
Get-ScheduledTask -TaskName "Qoder Daily Credit Claim" | Get-ScheduledTaskInfo

# اجرای فوری
Start-ScheduledTask -TaskName "Qoder Daily Credit Claim"

# تغییر ساعت
powershell -ExecutionPolicy Bypass -File scripts/install-task.ps1 -Time "07:30"

# حذف تسک
powershell -ExecutionPolicy Bypass -File scripts/install-task.ps1 -Uninstall
```

## پارامترها

| پارامتر | پیش‌فرض | معنی |
|---|---|---|
| `-Port` | `9222` | پورت محلی DevTools برای ارتباط با Qoder |
| `-QoderPath` | تشخیص خودکار | مسیر صریح `Qoder.exe` اگر تشخیص خودکار شکست بخورد |
| `-KeepOpen` | خاموش | Qoder بعد از دریافت باز بماند |
| `-StartupWaitSec` | `40` | چند ثانیه برای آماده شدن endpoint دیباگ صبر کند |

## کدهای خروج

| کد | معنی |
|---|---|
| `0` | دریافت موفق، **یا** چیزی برای دریافت نبود (امروز گرفته شده / کمپینی نیست) |
| `1` | خطا، یا نتیجه تأیید نشد |

## نکات مهم

- **Qoder ری‌استارت می‌شود.** اسکریپت به Qoderای نیاز دارد که با `--remote-debugging-port=9222`
  بالا آمده باشد. اگر Qoder بدون این پارامتر در حال اجرا باشد، اسکریپت آن را ری‌استارت می‌کند.
  Qoder نشستش را برمی‌گرداند، ولی کار ذخیره‌نشده در معرض خطر است — برای همین تسک صبح زود تنظیم شده.
- **پورت دیباگ فقط محلی است.** روی `127.0.0.1:9222` گوش می‌دهد، نه روی شبکه. با این حال تا وقتی
  Qoder با این پورت باز است، هر پروسه‌ای روی همان ماشین می‌تواند اپ را کنترل کند. اسکریپت بعد از
  کار Qoder را می‌بندد، مگر اینکه `-KeepOpen` بدهید.
- **تغییر رابط کاربری می‌تواند بشکندش.** کارت روزانه با متن `Claim 100 Credits Daily` پیدا می‌شود.
  اگر Qoder صفحه را بازطراحی کند، `FRAME_CLICK` را در `src/qoder-claim.js` به‌روز کنید.
  در آن حالت لاگ `claim control not found` می‌نویسد.
- **تأیید صادقانه است.** فقط وقتی موفقیت اعلام می‌شود که وضعیت خود اپ به
  `hasClaimableCampaign: false` تغییر کند یا صفحه «Claimed» نشان دهد؛ وگرنه با کد `1` خارج می‌شود
  و همان را می‌گوید.
- **هیچ اعتبارنامه‌ای دست‌کاری نمی‌شود.** اسکریپت هرگز توکن یا کوکی شما را نمی‌خواند، ذخیره نمی‌کند
  یا نمی‌فرستد؛ فقط اپِ لاگین‌شده را هدایت می‌کند.

## عیب‌یابی

**`Qoder renderer page not found`**
Qoder با پورت دیباگ اجرا نشده. از طریق `scripts/run-claim.ps1` اجرا کنید، نه با فراخوانی مستقیم
`node src/qoder-claim.js`.

**`campaign surface never rendered`**
پنجره‌ی کمپین باز نشد. Qoder را دستی باز کنید، روی نام پروفایل در پایین نوار کناری کلیک کنید،
**Rewards center** را انتخاب کنید و ببینید پنجره در شبکه‌ی شما لود می‌شود یا نه.

**`claim control not found`**
Qoder رابطش را عوض کرده. با محتوای `claim-log.txt` یک issue باز کنید.

**تسک اجرا می‌شود ولی اتفاقی نمی‌افتد**
مطمئن شوید نتیجه‌ی آخرین اجرا `0` است و `run-log.txt` را بخوانید. اگر Qoder وسط آپدیت بوده،
تلاش خودکار ساعت بعد جبرانش می‌کند.

## ساختار پروژه

```
qoder-daily-claim/
├── src/
│   ├── cdp.js           # کلاینت مینیمال Chrome DevTools Protocol (بدون وابستگی)
│   └── qoder-claim.js   # منطق دریافت: وضعیت → باز کردن → کلیک → تأیید
├── scripts/
│   ├── run-claim.ps1    # Qoder را با پورت دیباگ بالا می‌آورد و دریافت را اجرا می‌کند
│   └── install-task.ps1 # ثبت/حذف تسک روزانه
├── docs/
│   ├── README.zh-CN.md  # راهنمای چینی
│   └── README.fa.md     # همین راهنما
├── package.json
├── LICENSE
└── README.md
```

## مشارکت

issue و pull request خوش‌آمد است، به‌ویژه:
- به‌روزرسانی selectorها وقتی Qoder رابطش را عوض می‌کند،
- پشتیبانی macOS و Linux (منطق دریافت cross-platform است؛ فقط بخش زمان‌بندی مخصوص ویندوز است)،
- تأیید مطمئن‌تر نتیجه‌ی دریافت.

لطفاً روح پروژه را حفظ کنید: در هر پنجره فقط یک دریافت صادقانه، و خودکار نکردن هیچ کاری که
قوانین Qoder منع کرده است.

## لایسنس

[MIT](../LICENSE)

## سلب مسئولیت

این یک پروژه‌ی غیررسمی و اجتماعی است. هیچ وابستگی، تأیید یا پشتیبانی از سوی Qoder ندارد.
شرایط و قوانین کمپین Qoder ممکن است هر زمان تغییر کند؛ مسئولیت اطمینان از انطباق استفاده‌ی شما
با آن قوانین بر عهده‌ی خودتان است.
