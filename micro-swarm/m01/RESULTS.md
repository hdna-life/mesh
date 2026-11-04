# M0.1 — Protocol Independence

20 bağımsız çağrı kapısı: **20/20 (100%) — PASS**. Ön kayıt eşiği 18/20.
Ham yanıt Python sözdizimi geçişi: 0/20. Otomatik kullanılabilir kaynak: 20/20.

Bu, çalışan uygulama oranı değildir. AST parse importları çalıştırmaz, bağımlılık veya iş kuralı doğrulamaz. 20 stateless request aynı inventory app.py görevini farklı seed ile üretir; 20 farklı görev değildir.

| Çağrı | Seed | Ham sözdizimi | Format | Otomatik kullanılabilir | Hata |
|---|---:|---|---|---|---|
| protocol-01 | 1001 | no | fenced | yes | — |
| protocol-02 | 1002 | no | fenced | yes | — |
| protocol-03 | 1003 | no | fenced | yes | — |
| protocol-04 | 1004 | no | fenced | yes | — |
| protocol-05 | 1005 | no | fenced | yes | — |
| protocol-06 | 1006 | no | fenced | yes | — |
| protocol-07 | 1007 | no | fenced | yes | — |
| protocol-08 | 1008 | no | fenced | yes | — |
| protocol-09 | 1009 | no | fenced | yes | — |
| protocol-10 | 1010 | no | fenced | yes | — |
| protocol-11 | 1011 | no | fenced | yes | — |
| protocol-12 | 1012 | no | fenced | yes | — |
| protocol-13 | 1013 | no | fenced | yes | — |
| protocol-14 | 1014 | no | fenced | yes | — |
| protocol-15 | 1015 | no | fenced | yes | — |
| protocol-16 | 1016 | no | fenced | yes | — |
| protocol-17 | 1017 | no | fenced | yes | — |
| protocol-18 | 1018 | no | fenced | yes | — |
| protocol-19 | 1019 | no | fenced | yes | — |
| protocol-20 | 1020 | no | fenced | yes | — |

Protocol API Neuron toplamı: 443.33. M0 ile ortak günlük ledger korunur.

Kapı geçti; aşağıdaki ayrı ana görev koşumlarına dönüldü.

| Kol | Çağrı | Uygulama başarı | Çalıştırıldı | Hatalar |
|---|---:|---|---|---|
| A | 1 | FAIL | yes | runtime_error |
| A2 | 4 | FAIL | yes | runtime_error |
| B | 4 | FAIL | yes | syntax_error, runtime_error |
| C | 3 | FAIL | no | syntax_error |

**Tam sözleşmeyi geçen uygulama / koordinasyon kazancı gösterilmedi.**

Ham trace: runs/M01-protocol-1793749760743-2b00a907/trace.jsonl. Çıkarılan dosyalar M01-protocol-1793749760743-2b00a907/protocol-XX/app.py içinde. Ana koşumlar ayrı runs klasörlerinde. Orijinal M0 ../RESULTS.md içinde korunur.

Extractor/prompt/test sonuçlara göre değiştirilmedi. Başarısızlıklar paydadan çıkarılmadı.


## Üç sorunun ayrı yanıtı

1. **Çalıştırılabilir kaynak üretebiliyor mu?** Bu görevde evet: ana A/A2/B koşumları sandbox içinde Flask servisini başlattı ve gerçek HTTP istekleri aldı. Bu, doğru stok/rezervasyon backend'i üretildiği anlamına gelmez. Protokol örneklemindeki 20 dosyanın tamamı tek tek runtime testine sokulmadı; onlar yalnızca kaynak/sözdizimi/yazım kapısını ölçtü.
2. **İnsan müdahalesiz çıkarılabiliyor mu?** Evet, bu sınırlı testte 20/20. Ham kod halinde doğrudan AST geçişi 0/20; hepsinde tek Python fence bloğu çıkarıldı. Kaynak içeriğine elle müdahale veya LLM ile format onarımı yapılmadı. Böylece 18/20 kapısı sağlandı.
3. **A/A2/B/C uygulama testlerine ulaşıyor mu?** A/A2/B gerçek HTTP testlerine ulaştı. C schema aşamasında kaldı. Dolayısıyla dört kolun tümünün uygulama testlerine ulaştığı iddia edilemez.

## Uygulama hatalarının anlamı

- **A:** GET /products ve GET /reservations başlangıç kontrolleri geçti; POST /products için 201 yerine 405 geldi. Başlatılabilir servis var, gereken CRUD sözleşmesi yok.
- **A2:** Dört çağrı ve test geri beslemesine rağmen POST /products 405 sorunu sürdü. Onarım hakkı bu örnekte görevi tamamlatmadı.
- **B:** Schema çıktısı aynı products/reservations tablolarını iki kez CREATE ettiği için doğrulamada reddedildi. Sabit sıra diğer rollere devam etti; final uygulama temel endpoint'lere 404 döndürdü.
- **C:** Aynı tekrarlı CREATE TABLE çıktısı üç schema çağrısında da reddedildi: `table products already exists`. API ve entegrasyon aşamalarına geçilmedi. Logda kategori `syntax_error`; asıl neden SQL'in boş DB'de yürütülmesi sırasında şema çakışmasıdır, yalnızca leksik sözdizimi bozukluğu değildir.
- İlk zorunlu ürün oluşturma adımı başarısız olduğu için atomiklik, son stok yarışı, idempotency ve kalıcılık senaryolarının tamamı bu gerçek uygulamalarda yürütülemedi. Bunların doğru çalıştığına dair kanıt yoktur.
- `runtime_error` sınıflandırması runner'ın zorunlu setup adımındaki HTTP assertion hatalarını da kapsıyor. Bu koşumlardaki 404/405 hataları süreç hiç başlayamadı anlamına gelmez; ham test ve loglar farkı gösterir.

## Sınırlar ve karar

**M0.1 protokol hipotezi bu koşullarda desteklendi. M0 koordinasyon tezi hâlâ desteklenmedi.** %100, yalnızca önceden dondurulan bu 20 çağrının gözlenen protokol oranıdır. Tek görev, dört kola ait birer koşum ve küçük örneklem; genel güvenilirlik veya zekâ kanıtı değildir.

20 çağrı 20 ayrı request/yeni bağlam ve farklı seed ile yapıldı. **8 farklı kaynak hash'i** elde edildi. Aynı görevin tekrarları ve temperature=0, istatistiksel bağımsızlık veya 20 farklı problem iddiasına izin vermez. SQL çıktısı ilk 20 Python protokol çağrısında kalibre edilmemişti; B/C SQL hataları bu kapsam sınırını gösterdi.

Ana görevde başarı: **0/4**. Dinamik koordinasyon kazancı yok; A=0 ve C=0 için kazanç oranı tanımsız. 20 gerçek holdout yapılmadı. Daha güçlü modele geçilmedi, sonuçlara göre parser/prompt/test değiştirilmedi. M0 ve M0.1 dondurulmuş kaynak hash'leri son kontrol sırasında değişmeden kaldı.

M0.1 API'nin bildirdiği Neuron: protokol **443.33**, ayrı ana görev **172.03**, toplam **615.36**. Günlük rezervasyon ledger'ı önceki M0'ı da içerir ve 2500 üst sınırının altındadır; rezervasyon gerçek tüketim sayısı değildir. Ücretli moda geçilmedi. Docker kullanılmadı; daha önce bu iş için açılan Docker Desktop kapatıldı.

## Kanıtların korunması

`results/M01-raw-evidence.zip`: ilk 20 çağrının tüm ham prompt/yanıtları, çıkarılmış app.py dosyaları, ana koşumların tüm ara/son dosyaları, graph/state ve kabul testleri. `results/M01-evidence.json`: ölçüm özeti, kaynak/protokol hash'leri ve arşiv SHA-256 değeri. .env veya API secret'ı arşive alınmadı. Orijinal M0 ham arşivi üst projenin results klasöründe ayrı korunur.

Sonraki deney otomatik başlatılmadı. Kaynak çıkarma artık ilk engel değil; gözlenen açık sorunlar endpoint sözleşmesine uyum, SQL tekrarları ve hata geri beslemesinin işe yarar düzeltmeye dönüştürülememesi. Yeni bir kapsam veya yeni prompt denenirse yeni deney sürümü gerekir.
