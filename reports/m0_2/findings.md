# M0.2 — Contract-First Execution: bulgular

Tarih: 4 Kasım 2026 (Europe/Istanbul). **Deney tamamlandı; birincil başarı kriteri sağlanmadı. Tam görev başarısı 0/4. Koordinasyon tezi kanıtlanmadı.**

## Dürüst sonuç tablosu

| Kol | Tam görev | Son yürütülen kabul tanısı geçen/toplam | İlk HTTP/başlatma hatası | Çağrı | Repair | Input / output token | Süre sn | Artifact hata olayı | Graph değişimi |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|
| A | FAIL | 0/2 | startup_or_required_setup | 1 | 0 | 1074 / 669 | 5.15 | 1 | 0 |
| A2 | FAIL | 0/2 | startup_or_required_setup | 3 | 2 | 5326 / 2181 | 13.64 | 3 | 0 |
| B | FAIL | 0/0 | not reached | 3 | 2 | 3348 / 4608 | 27.46 | 3 | 0 |
| C | FAIL | 0/0 | not reached | 3 | 2 | 3348 / 4608 | 29.07 | 3 | 2 |

A/A2 için 0/2, iki startup/SQLite tanısının başarısız olduğunu gösterir; bütün iş testleri yalnızca iki taneden oluşuyor demek değildir. Servis başlayamadığı için gerçek HTTP CRUD, transaction, yarış ve restart senaryoları erişilemedi. B/C'de 0/0 uygulama testi başarı oranı değildir; uygulama aşamasına hiç gelinmedi. Erişilemeyen testler geçti sayılmadı. Hiçbir gerçek artifact tamamlanmış/kabul edilmiş duruma ulaşmadı.

## 1. Contract-First gerçek uygulama başarısını artırdı mı?

**Hayır.** M0.1 tam başarı 0/4, M0.2 de 0/4. Bu config'te doğrulama/ownership/ledger mekanizmaları bozuk çıktının active artifact olarak kabulünü engelledi; çalışan uygulama sağlamadı. Mekanizmaların doğruluğu 10 unit + 7 regression kontrolüyle desteklendi, fakat bunun model başarısına dönüştüğü gösterilmedi. M0.1'deki request/prompt düzeni ile bu sürüm arasında interface/context farkları olduğundan tek görevden nedensel kalite artışı/azalışı da çıkarılamaz.

## 2. Önceki 405, 404 ve duplicate schema ortadan kalktı mı?

**Ortadan kalktıkları gösterilmedi.** A/A2'de POST /products ve GET /reservations method/route eksikleri static checker tarafından yakalandı. Ancak bu kez program daha önce, kurulu olmayan ve görevde izin verilmeyen `flask_sqlalchemy` import'unda durdu. Başlangıç dosyası ayrıca PORT yerine 5000 sabitliyor. Bunlar kaynak incelemesi ve startup stderr kanıtlarıdır; HTTP 405 bu koşumda gözlenmedi çünkü sunucu başlamadı. Dolayısıyla “405 düzeldi” denemez.

B/C'de API veya validation uzmanı çalıştırılmadı; schema önkoşulu başarısızken devam edilmedi. Bu nedenle önceki 404 route kaybının gerçek çoklu artifact entegrasyonunda çözülüp çözülmediği **unknown**. Ownership ünitesi yabancı sahibin dosyayı değiştirmesini reddediyor, ancak bu gerçek koşumda API dosyası ortaya çıkmadı.

Duplicate tablo üretimi raw SQL metninde sürüyor. Schema cevaplarının tamamı tek SQL fence'i açıyor, aynı tabloyu tekrar tekrar yazıyor, tam output sınırına ulaşıyor ve fence'i kapatmıyor. Çıkarıcı bunları doğru biçimde reddediyor; gerçek SQL checker/migration adımına erişilmiyor. Token sınırına ulaşma gözlendi; provider ayrı finish_reason sunmadığından neden-sonuç iç modeli unknown. Başarı için eksik fence elle kapatılmadı, tablo tekrarları temizlenmedi.

- B schema attempt 1: 768/768 output tokens, fence marker count 1, raw CREATE occurrences {'products': 1, 'reservations': 26}.
- B schema attempt 2: 1920/1920 output tokens, fence marker count 1, raw CREATE occurrences {'products': 1, 'reservations': 66}.
- B schema attempt 3: 1920/1920 output tokens, fence marker count 1, raw CREATE occurrences {'products': 1, 'reservations': 66}.
- C schema attempt 1: 768/768 output tokens, fence marker count 1, raw CREATE occurrences {'products': 1, 'reservations': 26}.
- C schema attempt 2: 1920/1920 output tokens, fence marker count 1, raw CREATE occurrences {'products': 1, 'reservations': 66}.
- C schema attempt 3: 1920/1920 output tokens, fence marker count 1, raw CREATE occurrences {'products': 1, 'reservations': 66}.

Önceki ara mesajda “birden fazla kod bloğu” dendi; ham kayıtlar bunu doğrulamadı ve çalışma sırasında düzeltildi. Kesin gözlem **kapanmamış tek blok + token limitine kadar tablo tekrarı**dır.

## 3. Yeni darboğaz ne?

- A/A2: desteklenmeyen bağımlılık, eksik endpoint/method ve environment sözleşmesine uyumsuz kaynak.
- B/C: schema rolünde tekrar döngüsü, token sınırı ve tamamlanmamış çıktı. Owner ayrımı, tek yanıt içinde modelin SQL tekrarını kendiliğinden engellemiyor.
- Geçerli schema olmadığı için validation/API entegrasyonu, transaction doğruluğu veya atomik stok yarışı bu kollarla hâlâ ölçülemedi.

İki **orchestration sınırlaması** da bu deney sırasında görünür oldu; bunları model kusuru diye saklamıyoruz:

1. Runtime stderr (ModuleNotFoundError ayrıntısı) trace'te korunuyor, fakat repair prompt'una aynen taşınmıyor; check diagnostics yalnızca `application exited 1` ve diğer test hatalarını içeriyor. A2 eski kaynak ve route hatalarını görüyor, ama tam startup tanısı görmüyor. Bunun düzeltme başarısına etkisi bu koşumda unknown.
2. Extractor başarısız olduğunda parse edilmiş candidate yok; schema repair request'lerinde previous_source null. Hata mesajı veriliyor, ham bozuk yanıt logda saklanıyor fakat modele geri gönderilmiyor. “Tam önceki kaynak + ayrıntılı hata geri beslemesi her hata sınıfında eksiksiz sağlandı” iddiası yapılamaz.

Bu eksikler **sonuçlar görüldükten sonra aynı sürümde düzeltilmedi**. Yeni bir deney sürümünün konusu olabilir. Test/parser/prompt değiştirilip M0.2 başarılı gösterilmedi.

## 4. Uzmanlar kendi sorumluluklarını yerine getirdi mi?

- A/A2 single owner: hayır; app.py sözleşmesi/tam kabul geçmedi.
- B/C schema owner: hayır; üçer cevap hiçbir kullanılabilir schema artifact'ı sağlamadı.
- B/C validation ve API owner: **test edilmedi / unknown**; dependency nedeniyle çağrılmadılar. Bunlara başarı veya model yetersizliği sonucu atanmaz.
- Sahiplik, persistent task dedup, açık invalidation, retry sınırı ve bozuk repair'in önceki kabul edilmiş dosyayı koruması unit testlerde doğrulandı. Gerçek koşumlarda hiçbir accepted artifact olmadığı için gerçek accepted→bad-repair rollback olayı gözlenmedi.

## 5. C, B'den iyi miydi? Gerçek bir hata çözdü mü?

**Hayır.** İkisi de schema'da üç çağrı ve iki repair ile durdu. C yalnızca iki owner-routed graph repair node'u ekledi. Hiçbir node görevi tamamlatmadı. B ve C'nin karşılık gelen üç prompt'u da üç raw çıktısı da SHA-256 olarak aynı. C'nin graph'ı bu görevde B'den farklı bir model işi veya düzeltme üretmedi.

B/A2: tam başarı 0'a 0. Farklı katmanlarda durduklarından 0/0 üzerinden anlamlı kazanç oranı veya genel üstünlük çıkarılamaz. Artifact ownership/integration hataları aktif uygulamaya girmedi; **hataları azaltan doğruluk kazancı** ölçülmedi, yalnızca geçmeyen artifact'ların reddi ölçüldü.

## 6. Kolektif problem çözme hipotezi için sonuç

**Destekleyen olumlu kanıt yok.** Bu config'in birincil kriteri başarısız. Geçerli bağımsız parçalar üretilip entegre edilemediğinden, mikro uzmanların kolektif uçtan uca problem çözme katkısı yeterli aşamada hâlâ test edilemedi. Negatif tek görev geniş tezi kesin çürütmez; aynı şekilde deterministic engine testleri veya graph kayıtları tezi kanıtlamaz.

## Bütçe, tekrar ve bütünlük

Gerçek çağrı: **10**. Input token **13096**, output token **12066**. API'nin bildirdiği Neuron toplamı **252.406**. Her arm tek kez koşuldu, A dışındakiler önceden tanımlı iki repair sınırını aşmadı. Toplam duvar süreleri yaklaşık 75.31 sn; başarılı iş p95'i için örnek yok.


UTC gün sınırı bu deneyden önce değişti: ortak ledger 2026-11-04 UTC günü için yeni günlük pencere açtı; 779.056 Neuron üst sınır rezervasyonu / 10 çağrı kaydetti. Önceki günün M0/M0.1 ham usage/kanıtları korunuyor; elle kota sıfırlaması yapılmadı. Rezervasyon sayısı gerçek tüketim değildir. Günlük üst sınır 5000, Workers Free doğrulaması kullanıcının beyanı; ücretli plana geçiş yok. Başka tüketicilerin hesabı bilinmez.

M0/M0.1 önce-sonra dosya hash'leri ve M0.2 frozen manifesti değişmedi. Golden referans prompt'a veya model output'una kopyalanmadı. Önceki kabul suite'inin assertion bölümü byte-for-byte korundu. Docker kullanılmadı. Model kaynakları yalnızca kalibre edilmiş macOS sandbox altında çalıştırıldı; bu ortamın önceki sınırlamaları korunur.

## Kanıtlar

- `root-cause.md`: M0.1 çıktılarından, yeni koddan önce yapılan analiz.
- `protocol.md`: gerçek inference öncesi dondurulan görev, eşitsizlikler, sahiplik ve bütçe.
- `validation-results.json`: freeze öncesi 10 unit + 7 regression snapshot'ı (içindeki real_inference_started=false o ana aittir).
- `comparison.json`: değişmeden korunan arm özetleri, operational metrics, her attempt'in prompt/raw hash'i ve limit/fence bilgileri.
- `evidence-manifest.json` ve `M0.2-raw-evidence.zip`: bütün gerçek prompt/cevap, aday dosya, contract state, ledger, graph ve runtime tanıları; kaynak/protokol hash'leri.

Yeni model, ek retry veya yeni deney otomatik başlatılmadı. Bu sürümün negatif sonucu korunacak.
