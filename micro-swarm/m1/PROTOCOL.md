# M1 — Jev Decision Mesh: frozen execution protocol

4 Kasım 2026. Önceki M0/M0.1/M0.2 ve iptal edilen M0.3 yeniden başlatılmaz. Yalnızca OpenRouter `POST /api/alpha/decisions`, `typesafe/jev-1.14` kullanılır. Generative/Chat Completions çağrısı, merkezi reasoning modeli, SQL/Python üreten uzman yoktur. Model parametre sayısı doğrulanmış değildir; “1B / sub-billion fiziksel uzman ağı” iddiası yapılmaz.

## Yürütme ve bütçe

1. İki choice/noul soruluk API smoke önce çalıştırıldı. Ayrı smoke-protocol.json ve ham response kaydı; main backend iddiası değil.
2. Compiler, typed graph, invalid/unsupported kararlar, identifier sınırları, bütçe ve Jev olmayan kontroller için deterministik testler.
3. Main protocol/source/test/benchmark/config ve reused M0.2 verifier hash'leri dondurulur.
4. Bir gerçek Jev synthesis koşumu; sonra aynı mevcut 41 kontrolü içeren inventory HTTP/SQLite/concurrency/restart verifier'ı. Sonuçlara göre compiler veya soru değiştirilmez. Güçlü model yok, unlimited retry yok; max_reconsiderations=0 bu pilotta.

Tüm smoke+main için API cost cap **$0.05**, en çok 20 request, bir request'te en çok 32 soru. Ücret her request öncesi state UTF-8 bytes × soru sayısı + bütün criteria/instructions bytes + soru başına 1024 framing token varsayımıyla muhafazakâr rezerve edilir; input token başına $0.000000042 fiyat snapshot'ı kullanılır. Gerçek usage.cost ayrı tutulur. Eksik/beklenenden yüksek cost, transport belirsizliği, tavan veya auth/provider hatası yeni request'leri durdurur. Ledger silinmez veya iade ile tekrar çağrı açılmaz. Dış hesaptaki diğer tüketiciler bilinmez. API key hiçbir loga girmez.

## Yedi rol ve kapalı aday uzayı

Entity → Field → Relationship → Constraint → Operation → Transaction → HTTP bağımlılık sırası. Operation rolünün ikinci geçişi seçilmiş operation kind'larının value/state/sort binding'lerini yapar. Her soru choice/noul tipindedir; kod, serbest metin artifact veya code parser kullanılmaz. API response winner/probabilities/confidence/noul, returned model revision, cost ve latency ham JSONL'ye yazılır. Noul threshold=0.5; choice winner aynen alınır, test sonucuna göre başka adaya çevrilmez.

Aday entity/field isimleri ve grupları insanın önceki açık wire/schema requirements'ındaki veri sözlüğünden gelir (`benchmarks/input.json` provenance ve SHA). Bunlar golden implementation'dan alınmaz. Sıfırdan açık uçlu entity-name keşfi kanıtı değil; sınırlandırılmış, insan tarafından verilen symbol dictionary üzerinden seçimdir. Endpoint adayları ve body property adları yine açık kullanıcı sözleşmesidir. Literal bounds, state strings ve regex seçenekleri bu açık metinden gelen havuzdur. Eski "source code üret" sunum talimatı yeni requirements kopyasından çıkarılmıştır; HTTP/business şartları korunur.

Her Jev seçimi graph node, role, requirement source, önceki rol dependency IDs, model/request ID ve distribution ile kaydedilir. Typed-valid, semantically-correct anlamına gelmez. Unknown enum, unsupported operation, eksik referans, çelişki veya tamamlanmamış karar compiler tarafından reddedilir; human control IR'den tamamlanmaz. Bu pilotta graph çelişkileri raporlanır; reconsideration kapalıdır.

## Genel IR ve compiler katkısı

Genel IR entities/fields/relationships, validation rules, operations, expression guards, effect bindings, transactions, state transitions, HTTP bindings, error status maps, provenance/unresolved taşır. Desteklenen kapalı operation dili: create, list, get, guarded_create, transition. Expression dili ref/lit ve add/sub/ge/le/eq/ne/and. Compiler identifier/type/reference checks yapar; başka semantiği unsupported_operation olarak reddeder.

Compiler/runtime ad, tablo, endpoint veya inventory özel dalı içermez. Fakat önemli mekanikler **insan yazımı runtime'dan** gelir: SQL DDL ve migration IF NOT EXISTS, integer identity, parametreli query, validation yürütmesi, selected atomic=true için BEGIN IMMEDIATE, idempotent create'in input-bound kolon karşılaştırması, conditional transition, effect update'leri, hata JSON formatı, Flask registration/server başlangıcı, thread handling ve SQLite persistence. Bunlar Jev tarafından keşfedilmiş algoritmalar değildir. Jev bu mekaniklerin nerede/hangi entity/field/op/koşul/status ile kullanılacağını seçer.

Karar adapter'ı da insan yazımı, domain-bounded gramerdir: bir ilişkili numeric effect için candidate bindings sunar. Daha fazla ilişki/etki, keyfi business workflow veya doğal dilden genel program planlama yeteneği iddia edilmez. Genel IR elle verilirse compiler model olmadan uygulama üretebilir; bu açıkça ölçülür.

## Model olmayan kontroller ve başarı

- Tamamlanmamış/empty karar durumu: geçerli uygulama uydurulamaz.
- Sabit first-choice policy: aynı aday uzayı, Jev yok; sonuç ve compiler hatası ayrı kayıt.
- Human-complete IR: test fixture (üretim adapter'ı bunu okumaz), aynı compiler ve aynı gerçek verifier. Bu kontrolün 41/41 geçmesi Jev başarısı değildir.

Main başarı yalnızca gerçekten başlatılan uygulamanın mevcut bütün HTTP/SQLite/transaction/race/restart kontrollerini geçmesidir. Valid Python veya typed-valid Jev cevabı başarı sayılmaz. Başlatma veya setup hatasında erişilemeyen testler geçti sayılmaz. Golden source modele, adapter'a veya compiler'a verilmez; eski verifier ve human-IR test kontrolü ayrı tutulur. Renaming/static no-task-name testleri genellik için sınırlı kontrol; tüm görevlerde genel compiler kanıtı değildir.

## Rapor

Semantic decision sayısı, typed-valid seçimler, consistency conflicts, incomplete decisions, IR compile başarısı, backend başlangıcı, test sayıları, inference süre/cost ve katman sorumlulukları ayrı raporlanır. Tek başarılı constrained-domain koşum merkezi reasoning olmadan genel yazılım sentezi veya dağıtık fiziksel uzman ağı tezini kanıtlamaz. Kaynak/manifest/ham karar/IR/compiler çıktısı/verifier logları saklanır.

Resmi API kaynağı: https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request
Model fiyat/sürüm kaynağı: https://openrouter.ai/typesafe/jev-1.14/
