# M0.2 öncesi kök neden analizi

Tarih: 4 Kasım 2026 (Europe/Istanbul). Bu belge yeni uygulama kodu yazılmadan önce M0.1 ham cevap, snapshot, trace ve orchestrator kaynakları incelenerek oluşturuldu. Önceki sonuçlar değiştirilmedi.

## A / A2: 405

Kanıt: `micro-swarm/m01/runs/1793749890659-dev-inventory-A-99cb0bcc/attempt-1/app.py:34` yalnızca GET /products kaydediyor. Ürün oluşturma handler'ı yok. Satır 74'te POST /reservations var; bu handler sku/name/stock okuyup products tablosuna INSERT ediyor (79–94). Dolayısıyla yalnızca yanlış status değil, ürün oluşturma ve rezervasyon sorumlulukları da karışmış. POST /products sözleşmesi eksik olduğu için Flask 405 döndürdü. URL var, method eksik.

A2 `1793749897440-dev-inventory-A2-936b7023` koşumunun dört snapshot'ında da yalnızca GET /products var. Trace inference_request satırları 5/9/13 hata geri beslemesi içeriyor; model düzeltmesi eksik POST handler'ını eklemiyor. Bilişsel iç neden unknown; gözlenebilir neden eksik method/handler ve yanlış görev eşleştirmesi.

## B: 404

`1793749924735-dev-inventory-B-1fd4841d/attempt-2/app.py` API uzmanı çıktısında route dekoratörleri mevcut (42/47/52/57/62/79). `attempt-3/app.py` validation rolü sonrasında bu fonksiyonlar dekoratörsüz (ör. 29/37/45/61). `attempt-4/app.py` repair de dekoratörleri geri getirmiyor. Final Flask app'inde zorunlu GET /products, GET /reservations ve POST /products kayıtlı değil; trace execution kayıtları bu endpoint'lerde 404 gösteriyor.

Model hatası: validation çıktısı route kayıtlarını kaldırıyor. Orchestration hatası: validation/repair, API'nin app.py artifact'ını koşulsuz değiştirebiliyor; yalnızca AST kontrolü var, route/method sözleşmesi kabulden önce denetlenmiyor. Daha önceki geçerli route yapısı korunmuyor. Ayrıca B schema reddinden sonra bağımlılıkları karşılamadan diğer rollere devam ediyor (`m01/src/experiment.ts:60–67`).

## C: duplicate schema

`1793749939230-dev-inventory-C-465862fe/trace.jsonl` inference_response satırları 3/8/13: HER BİR yanıtın içinde products, reservations, products, reservations olmak üzere dört CREATE TABLE var. IF NOT EXISTS yok. Tek cevap boş SQLite'a ilk uygulanışında zaten `table products already exists` hatası üretiyor.

- Aynı uzman bir cevapta aynı iki tabloyu iki kez üretiyor: **evet**.
- İki farklı uzman aynı schema artifact'ını üretiyor: **hayır**, bütün çağrılar schema rolü.
- Schema görevi yeniden çağrılıyor: **evet**, iki açık format/schema retry ile üç inference var. Başarıyla tamamlanmış görev yeniden uygulanmış değil; hiçbir schema kabul edilmiyor.
- Hata persistent DB'ye migration'ın iki kez uygulanmasından mı: **hayır**, doğrulayıcı her çağrıda yeni `:memory:` DB açıyor (`m01/src/extractor.ts`). Her yanıtın kendi içindeki çift CREATE yeterli neden.
- Migration ikinci kez uygulandığında güvenli mi: **unknown**, M0.1 bunu ayrı ölçmedi; ilk uygulama bile geçmedi.

Üç inference_request aynı messages hash'ine sahip: `8a8fc0857d002fb3939c1f79cef1acd952db895430e79faa1aa5fd4429061c52`. Her feedback alanı null. Motor hata kaydedip yeniden denese de `m01/src/experiment.ts:77` yeniden çağrısına tanıyı taşımıyor. Aynı başarısız istemin tekrarı bir orchestration sınırı. Ledger eksikliği gözlendi, ancak bu özel duplicate SQL hatasını ledger'ın tek başına düzelteceği sonucu çıkarılamaz.

## Hata sorumlulukları

| Bulgu | Katman | Kanıtın sınırı |
|---|---|---|
| POST /products eksik / reservation handler içinde product INSERT | Model / görev uyumu | İç model nedeni unknown |
| Validation'ın API route dekoratörlerini silmesi | Model çıktısı + engine ownership eksiği | App.py birden çok role açıktı |
| Bozuk route yapısının kabul edilmesi | Orchestrator validation/rollback eksiği | AST geçişi HTTP doğruluğu değil |
| Tek SQL cevabında duplicate CREATE | Model | Migration tekrarı değil |
| C retry'larında feedback=null, aynı input hash | Orchestrator | Modelin doğru feedback ile düzeleceği henüz unknown |
| SQL runtime çakışmasının syntax_error olarak etiketlenmesi | Hata taksonomisi | SQL leksik syntax bozukluğu diye yorumlanmamalı |
| setup HTTP assertion'larının runtime_error sayılması | Runner sınıflandırması | Uygulama aslında başlamıştı |
| Atomiklik/idempotency doğruluğu | unknown | Ön koşul ürün oluşturma başarısız; ilgili testler erişilemedi |

## M0.2 için çıkarım

Kontrol edilecek müdahaleler: tek artifact sahibi, bağımlılık önkoşulu, kabulden önce route/schema/interface doğrulaması, transaction benzeri candidate kabulü, ayrı attempt snapshot'ları, açık retry/invalidation ve hata sahibine tanı iletimi. Bunlar çözüm SQL'i veya handler kodu yazma izni değildir. Model yeteneğinin veya koordinasyon kazancının artacağı henüz gösterilmedi.
