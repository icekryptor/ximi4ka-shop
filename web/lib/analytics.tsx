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
// gtag('event','purchase',…) и т.п. — покупка задвоится. Если появится GTM —
// перед каждым ecommerce-пакетом делать dataLayer.push({ ecommerce: null }),
// чтобы данные прошлого события не склеились со следующим.
export function MetrikaScript({ counterId }: { counterId: string }) {
  return (
    <>
      <MetrikaCounterId counterId={counterId} />
      <Script id="metrika" strategy="afterInteractive">{`
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

// GA4 (gtag.js). Loads `afterInteractive` so first paint is not blocked. The
// measurement ID is injected via JSON.stringify for the same escaping reason
// as above.
export function Ga4Script({ measurementId }: { measurementId: string }) {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
        strategy="afterInteractive"
      />
      <Script id="ga4" strategy="afterInteractive">{`
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
      <Script id="vk-pixel" strategy="afterInteractive">{`
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
