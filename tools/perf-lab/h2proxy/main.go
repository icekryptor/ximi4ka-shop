// HTTPS + HTTP/2 обратный прокси на стандартном net/http — тот же планировщик
// HTTP/2 (round-robin), что у Caddy. usage: h2proxy <listen> <upstream http url>
package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"log"
	"math/big"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"time"
)

func cert() tls.Certificate {
	k, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	t := x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "ximi4ka.ru"},
		DNSNames: []string{"ximi4ka.ru"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(24 * time.Hour)}
	d, _ := x509.CreateCertificate(rand.Reader, &t, &t, &k.PublicKey, k)
	return tls.Certificate{Certificate: [][]byte{d}, PrivateKey: k}
}

func main() {
	u, _ := url.Parse(os.Args[2])
	p := httputil.NewSingleHostReverseProxy(u)
	p.FlushInterval = -1 // стриминг HTML как у Caddy
	s := &http.Server{Addr: os.Args[1], Handler: p, TLSConfig: &tls.Config{Certificates: []tls.Certificate{cert()}}}
	log.Fatal(s.ListenAndServeTLS("", ""))
}
