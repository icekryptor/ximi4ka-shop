import Script from 'next/script'

// Injects the Яндекс.Метрика counter. We escape the counterId through
// JSON.stringify even though it's a numeric string — admin-editable values
// never go into a template literal unquoted, because that would be a trivial
// stored-XSS vector if validation ever lapsed.
export function MetrikaScript({ counterId }: { counterId: string }) {
  return (
    <>
      <Script id="metrika" strategy="afterInteractive">{`
        (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
        (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
        ym(${JSON.stringify(counterId)}, "init", { clickmap:true, trackLinks:true, accurateTrackBounce:true });
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
