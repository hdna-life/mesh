# Sınırlar

- Bu MVP prompt ile rol ayrımı yapılan aynı 1B modeldir. 265M uzmanlar, eğitim, WebGPU, dağıtık ağ, özgünlük veya genel zekâ ölçülmez.
- İlk M0 tek bir development görevidir. 20 holdout aynı iş ailesindeki parametrik varyasyonlardır; geniş ve bağımsız bir benchmark değildir.
- Graph yalnızca kayıtlı dört capability’yi bilir. Bilinmeyen gereksinim keşfi veya açık uçlu semantik planlama yoktur. İlk schema/API/validation hedefleri aynı bağımlılık sırasına çıkar; C’nin farkı koşullu yeniden deneme/onarım ve graph önkoşullarıdır. Allowlisted öneriler dedup edilir, plan bağımlılıkları kontrol edilir; yeni uzman icat edilmez.
- A/B/C/A2 aynı bütçe tavanına sahiptir; kullanılan gerçek hesaplama miktarı eşitlenmez. Kullanılan token ve süre ayrıca raporlanır. Uzman girişleri geçmiş üretilen dosyaları tekrar içerir; bu maliyet bütçededir.
- macOS Seatbelt, VM değildir. Kullanıcı veri dizinleri, diğer geçici alanlar, keychain ve kaynaklar okunamaz; yalnızca koşum temp alanına yazılır. Uygulama ortamı secret içermez; her çalıştırmada dış okuma/yazma, proje kaynağı okuma ve dış/başka loopback bağlantısı yasakları sentinel ile sınanır. Uygulama sadece atanmış test portunu dinleyebilir.
- Kurulu sistem dosyaları okunabilir; bu profil tüm olası OS servisleri üzerinden kötü niyetli kaçışı kanıtlamaz. Python/SQLite/Flask açıklarına karşı kernel/VM izolasyonu iddia edilmez. Güvenilmeyen üçüncü taraf saldırı kodu için uygun bir genel sandbox hizmeti değildir.
- CPU 12 saniye, wall timeout, dosya başına 2MiB ve 96 dosya tanıtıcı sınırı uygulanır. RSS 256MiB ve process group 8 sınırı 200ms aralıkla izlenip aşımda süreç grubu öldürülür; bunlar kernel hard memory/pid limitleri değildir. Kısa aralıkta aşım olabilir. Timeout’ta parent/child süreç grupları temizlenir.
- Geçici port seçimi ile bind arasında küçük bir yarış penceresi vardır; her run taze çalışma alanı kullanır.
- Cloudflare model ağırlık revizyonu ve server davranışı CLI tarafından sabitlenemez. Verilen seed tekrarlanabilirlik garantisi değildir.
- Ücretsiz plan kullanıcı tarafından doğrulanır. Hesaptaki başka tüketicilerin kotası izlenmez. Yerel rezervasyon ledger’ı günler arasında UTC ile döner; eşzamanlı erişim kilitlidir. Hata sonrası rezervasyon iade edilmez; mevcut ücretsiz kalan kota bilinmez. Ücretli plana otomatik geçiş yoktur.
- Secret `.env` içine yazılır ve loglara konmaz. Test runner temiz env alır, model bağlamına yalnızca spec/dosya/test tanısı girer. Provider tarafında hassas gerçek kullanıcı verisi kullanılmaz.
- K1/K2 eşikleri başlangıç araştırma kapısıdır, istatistiksel kanıt değildir. Tek seed ve tek görevden nedensel koordinasyon üstünlüğü çıkarılamaz. A2 ve C/B kıyası raporlanmadan olumlu iddia yapılmaz.
