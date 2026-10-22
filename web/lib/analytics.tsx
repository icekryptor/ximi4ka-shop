import Script from 'next/script'
import { MetrikaCounterId } from '@/components/MetrikaCounterId'

// Injects the Яндекс.Метрика counter. We escape the counterId through
// JSON.stringify even though it's a numeric string — admin-editable values
// never go into a template literal unquoted, because that would be a trivial
// stored-XSS vector if validation ever lapsed.
// ecommerce:"dataLayer" включает приём электронной коммерции из
// window.dataLayer (события — web/lib/metrika.ts). Вебвизор не включён.
// dataLayer общий с GA4 (Ga4Script) и Метрикой. Метрика понимает и gtag-формат,
// поэтому при включённом ecommerce:"dataLayer" НЕ добавлять
// gtag('event','purchase',…) и т.п. — покупка задвоится.
// Google Tag Manager (GTM-NGJJLKQB) снят 23.10.2026: контейнер был пуст, а gtm.js
// занимал ~100 мс главного потока после load и ухудшал INP. Возвращать вместе с
// первым тегом и проверить, что теги контейнера не дублируют Метрику и GA4.
// Счётчики грузятся `lazyOnload` (после события load): на медленном 4G
// tag.js Метрики (69 КБ) и код mail.ru (47 КБ) стартовали сразу после
// гидратации и отбирали канал у главной картинки (PSI mobile: LCP 8,9 с).
// Ранние события не теряются: reachGoal (lib/metrika.ts) складывает вызовы в
// очередь ym, а стаб ниже её подхватывает.
export function MetrikaScript({ counterId }: { counterId: string }) {
  return (
    <>
      <MetrikaCounterId counterId={counterId} />
      <Script id="metrika" strategy="lazyOnload">{`
        (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
        (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
        ym(${JSON.stringify(counterId)}, "init", { clickmap:true, trackLinks:true, accurateTrackBounce:true, ecommerce:"dataLayer" });
      `}</Script>
      <noscript>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- tracking pixel must be a plain img; next/image adds unwanted optimization pipeline. */}
          <img
            src={`https://mc.yandex.ru/watch/${encodeURIComponent(counterId)}`}
            style={{ position: 'absolute', left: '-9999px' }}
            alt=""
          />
        </div>
      </noscript>
    </>
  )
}

// Вариокуб (Яндекс эксперименты, exp.js). Работает поверх счётчика Метрики того
// же сайта — ID берём из настройки metrikaId, как и MetrikaScript, а не из
// кода. Грузится `lazyOnload`, как остальные счётчики (см. MetrikaScript):
// без экспериментов в кабинете скрипт ничего не меняет на странице. Если когда-нибудь
// заведут визуальный эксперимент, он применится после load и может дать мигание.
// Обработчик error — из кода Яндекса: если exp.js не загрузился (блокировщик,
// сеть), колбэки init получают пустые флаги и страница работает как без экспериментов.
export function VarioqubScript({ counterId }: { counterId: string }) {
  return (
    <Script id="varioqub" strategy="lazyOnload">{`
      (function(e,x,pe,r,i,me,nt){
        e[i]=e[i]||function(){(e[i].a=e[i].a||[]).push(arguments)};
        me=x.createElement(pe);me.async=1;me.src=r;nt=x.getElementsByTagName(pe)[0];
        me.addEventListener('error',function(){
          function cb(t){t=t[t.length-1];'function'==typeof t&&t({flags:{}})}
          Array.isArray(e[i].a)&&e[i].a.forEach(cb);
          e[i]=function(){cb(arguments)}
        });
        nt.parentNode.insertBefore(me,nt)
      })(window, document, "script", "https://abt.s3.yandex.net/expjs/latest/exp.js", "ymab");
      ymab(${JSON.stringify(`metrika.${counterId}`)}, "init");
    `}</Script>
  )
}

// GA4 (gtag.js). Loads `lazyOnload`, like the other counters, so it does not
// compete with the hero image and the main bundle. The
// measurement ID is injected via JSON.stringify for the same escaping reason
// as above.
export function Ga4Script({ measurementId }: { measurementId: string }) {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
        strategy="lazyOnload"
      />
      <Script id="ga4" strategy="lazyOnload">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', ${JSON.stringify(measurementId)});
      `}</Script>
    </>
  )
}

// Пиксель VK (Top.Mail.Ru) для ретаргетинга и конверсий в VK Рекламе. ID — не
// секрет и не меняется между окружениями, поэтому зашит в код, как и тег
// Яндекс Мерчантов в layout.tsx: пиксель работает, даже если API настроек лежит.
export const VK_PIXEL_ID = '3799738'

export function VkPixelScript({ pixelId = VK_PIXEL_ID }: { pixelId?: string }) {
  return (
    <>
      <Script id="vk-pixel" strategy="lazyOnload">{`
        var _tmr = window._tmr || (window._tmr = []);
        _tmr.push({id: ${JSON.stringify(pixelId)}, type: "pageView", start: (new Date()).getTime()});
        (function (d, w, id) {
          if (d.getElementById(id)) return;
          var ts = d.createElement("script"); ts.type = "text/javascript"; ts.async = true; ts.id = id;
          ts.src = "https://top-fwz1.mail.ru/js/code.js";
          var f = function () {var s = d.getElementsByTagName("script")[0]; s.parentNode.insertBefore(ts, s);};
          if (w.opera == "[object Opera]") { d.addEventListener("DOMContentLoaded", f, false); } else { f(); }
        })(document, window, "tmr-code");
      `}</Script>
      <noscript>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- tracking pixel must be a plain img; next/image adds unwanted optimization pipeline. */}
          <img
            src={`https://top-fwz1.mail.ru/counter?id=${encodeURIComponent(pixelId)};js=na`}
            style={{ position: 'absolute', left: '-9999px' }}
            alt="Top.Mail.Ru"
          />
        </div>
      </noscript>
    </>
  )
}
