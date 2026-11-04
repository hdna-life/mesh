# M0.2 — Contract-First Execution: ön kayıt

Tarih: 4 Kasım 2026, Europe/Istanbul. Bu protokol gerçek M0.2 inference'ından önce dondurulur. M0/M0.1 kaynakları, raporları ve arşivleri değiştirilmez. Kök neden raporu bu sürümün kodundan önce yazıldı.

## Sabit görev ve kaynak

Önceki stok/rezervasyon Flask + SQLite API sözleşmesi ve development senaryosu aynıdır. Model yalnızca `@cf/meta/llama-3.2-1b-instruct`; seed 42, temperature 0. Yeni model, merkezi LLM planner, Docker, eğitim veya yerel model yoktur. 20 holdout çalıştırılmaz. M0.1 deterministik ham/tek-fence çıkarıcısı değiştirilmeden kullanılır.

`contract.json` endpoint/method, tablo/kolon/unique/foreign-key ve saf validation fonksiyon arayüzlerini bildirir. Bunlar insan tarafından verilen gereksinim ve yeni entegrasyon sözleşmesidir; engine tarafından keşfedilmiş semantik veya üretilmiş çözüm değildir. Semantic source alanları her run'da loglanır. Engine'de hazır SQL/handler/backend çözümü yoktur. Golden referans ve test validator'ı yalnızca regression testlerinden erişilir, gerçek modele verilmez.

## Sahiplik ve arayüz

A/A2: tek `single_expert`, yalnızca app.py; şema ve validation kendi kodunda inline olabilir. Bu, tek model/tek artifact baseline anlamını korur.

B/C:

| Capability | Artifact | Owner | Dependencies | Kabul |
|---|---|---|---|---|
| schema | schema.sql | schema_expert | requirements | tek tanım, beklenen SQLite yapı/unique/FK, ilk ve ikinci uygulama |
| validation | validation.py | validation_expert | requirements | üç tek-argümanlı fonksiyon, saf return sözleşmesi, sandbox davranış testleri |
| api | app.py | api_expert | requirements, schema, validation | route/method/interface/ownership + aynı tam HTTP/SQLite kabul suite'i |

Validation fonksiyonları `validate_product(data)`, `validate_reservation(data)`, `validate_cancel(data)`; başarıda `(normalized_dict, None)`, hatada `(None, nonempty_error_string)`. HTTP response veya DB erişimi yok. API, validation sahibinin dosyasını değiştiremez, kendi validators'ını yeniden tanımlayamaz, schema sahibinin CREATE SQL'ini kendi dosyasına gömemez. API supplied schema.sql dosyasını uygular; engine bunu uygulama yerine üretmez. Source dosyalarına runtime yazma sandbox tarafından da engellenir.

Bu dosya ayrımı/arayüz zorunluluğu A/A2'de yoktur; B/C'ye özgü entegrasyon maliyetidir ve raporlanacaktır. Genel extractor, sahiplik kontrolü, ledger, route/schema denetimi, aynı wire contract ve nihai kabul suite'i bütün kollarda bulunur. A/A2'nin monolith DDL'i sabit string olarak AST'de çözülemezse statik schema denetimi `unknown` olur; gerçek DB ve restart suite'i yine zorunludur. Statik field kelime eşleşmesi doğruluk kanıtı sayılmaz; request/response alanları gerçek HTTP testleriyle ölçülür.

## Kollar ve repair sınırı

- A: tek model, tek çağrı, sıfır repair.
- A2: tek model app.py, ilk çağrı + en fazla iki tanılı repair.
- B: önceden sabit schema → validation → api sırası. Yeni dosya arayüzleri nedeniyle sıra M0.1'den farklıdır; API iki bağımlılık tamamlanmadan çalışmaz. Başarısız mevcut aşamaya yerel owner repair uygulanabilir; tamamlanmış aşamalara özel dinamik geri dönüş veya yeni görev keşfi yoktur.
- C: goal/dependency durumundan runnable task seçer; hata artifact sahibine yönlenir, ayrı graph repair node'u ve açık retry kararı yaratılır. Invalidation downstream completed task'ları da invalidated yapar. Allowlist üç capability; yeni uzman veya semantik gereksinim icat edilmez.

A'nın tek-attempt tanımı korunur; A2/B/C'de GLOBAL toplam iki repair hakkı vardır. Owner başına iki hak veya sınırsız yeni task yoktur. Tek görevde B ile C aynı hata/sıra davranışına çıkabilir; graph kayıtları tek başına koordinasyon kazanımı değildir. C'nin gerçekten çözdüğü hata ancak önce-sonra artifact/test kanıtıyla söylenir.

Her aday önce staging alanında doğrulanır; geçmeyen dosya active artifact'a alınmaz. Önceki kabul edilmiş dosya ve rejected aday ayrı korunur. Repair aynı artifact sahibinin yeni inference çağrısıdır; bağımsız repair uzmanı başka sahibin dosyasını yazamaz. Modelin hatalı kaynağı elle değiştirilmez; parser kod birleştirme/onarım yapmaz.

## Execution ledger ve migration ayrımı

Ledger diske JSONL yazar: task_id, capability, owner, status, input_hash, artifact_hash, accepted hash, attempt, explicit retry/invalidation reason. Restart sırasında doğrulanıp yeniden yüklenir. Aynı task+aynı input completed ise cache hit, tekrar apply/inference yoktur. Değişen input için invalidation gerekir. Rejected repair önceki active dosyayı korur. Çöken running task açık retry gerektirir.

SQL ayrı ölçülür: yorum/string literal'leri ayıran deterministik tokenizer aynı script'teki duplicate CREATE TABLE'ı işaretler. SQL boş gerçek SQLite'a uygulanır; tablolar, kolonlar, PK, unique ve FK incelenir; migration ikinci kez uygulanır ve schema fingerprint'i değişmemelidir. Schema script'inde veri silme/değiştirme ve dış dosya erişimi SQL authorizer ile reddedilir. Asıl veri/restart kalıcılığı aynı HTTP suite'indedir. Ledger cache başarısı SQL idempotency sayılmaz.

## Bütçe ve tek koşum

Her kol: toplam en fazla 5 inference çağrısı, 12288 çıktı token rezervasyonu, 96000 muhafazakâr toplam input+output token tavanı, 180s wall limit kontrolü. Operasyonel p95<120s hedefi korunur, dört tek görevin dağılımından istatistiksel hedef başarısı çıkarılmaz.

- A: tek çağrı 12288.
- A2: 6144 + 3072 + 3072.
- B/C başlangıç: schema 768, validation 1536, API 6144. Her repair en fazla 1920; iki repair ile toplam en fazla 12288.

Eşit olan tavanlardır, gerçek kullanılan token/call sayısı değil. Kullanılan miktarlar ayrıca raporlanır. Eksik/gereksiz çağrı farkı kazanç diye gizlenmez. Batch en fazla 20 çağrı. Ortak UTC günlük rezervasyon ledger'ı önceki M0/M0.1 tüketimini de içerir; bu sürümün toplam günlük üst sınırı önceden **5000 Neuron** olarak seçildi, eski tüketim silinmedi. Workers Free kullanıcı doğrulaması zorunlu, paid moda geçilmez. Başka uygulamaların tüketimi bilinmez. Provider/kota hatasında yeni çağrılar durur; başarısız arm değiştirilmez veya başarılı sonuç seçmek için yeniden başlatılmaz.

A/A2/B/C birer kez, bu sırada çalıştırılır. Gerçek sonuçlardan sonra extractor/prompt/config/test değiştirilemez. Bulgular sonraki sürüme bırakılır. Frozen manifest bütün yeni kaynak/test/config/sözleşme dosyalarını ve kullanılan eski yardımcıları hash'ler.

## Test ve başarı kararı

Önce deterministik unit testleri; duplicate owner, persistent dedup, dependency/cycle, method/route, duplicate SQL ve migration idempotency ayrımı, owner repair routing, iki retry sınırı, invalidation ve bozuk repair'in önceki active dosyayı koruması.

Sonra önceki tam golden reference ve aynı dört mutant (stok düşümü eksik, iki kez iptal iadesi, restart veri silme, boolean miktar) değişmeyen HTTP suite'inde koşulur. Ayrıca yeni validation module checker'ı doğru/bozuk özel referansla kalibre edilir. Bu private referanslar gerçek model kaynağına kopyalanmaz.

Kabul testlerinin assertion bölümü M0'dan byte-for-byte korunur. Runner'a yalnızca validation.py taşıma, source-write yasağı ve bağımsız module-check modu eklenir. Önkoşul ürün oluşturma başarısızsa sonraki bağımlı business testler `not reached` sayılır; geçmişte olduğu gibi bunlar geçildi olarak sayılmaz. Statik başarısızlık sözdizimi elveriyorsa runtime suite'inin denenmesini engellemez; sözdizimi/import/sandbox önkoşulu yoksa bunun nedeni kaydedilir.

Birincil başarı: en az bir gerçek kol bütün app sözleşmelerini VE önceden tanımlı HTTP/SQLite testlerini geçer. Başlatılan servis, GET başarısı, AST geçişi, artifact kabulü veya unit test başarısı tam görev başarısı değildir. İkincil kıyas B/A2 ve C/B; tek görev/tek seed ancak gözlenen sayılarla yorumlanır, bilimsel kanıt veya genel mikro uzman üstünlüğü sayılmaz.

Tüm başarısız aday, raw prompt/yanıt, validation, ledger, graph, stdout/stderr saklanır. Karar değiştirilmeksizin reports/m0_2/comparison.json ve findings.md içine yazılır.
