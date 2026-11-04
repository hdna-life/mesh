# M1-r2 sonuç

| Ölçüm | Gözlem |
|---|---|
| Jev koordinatör kararı | 1 gerçek alternatifli seçim; deterministik öncelikten farklı: 0 |
| 1B uzman cevabı | 6 inference cevabı; 3 benzersiz geçerli karar |
| Geçerli / geçersiz / çelişkili / eksik | 3 / 3 cevap denemesi / 0 gözlenen / 19 kuyruğa alınmış karar |
| IR tamamlandı mı? | Hayır |
| Backend başladı mı? | Hayır |
| 41 kabul kontrolü | Erişilemedi; 0 çalıştırıldı, başarı iddiası yok |
| Toplam çağrı | 7 = 6 Cloudflare + 1 OpenRouter |
| Token | CF 4434 input / 12 output; OR 439 input / 31 output |
| API maliyeti | OR $0.000018438; CF 11.114397 Neuron, Workers Free. CF fiyat eşdeğeri $0.00012213, fatura değil |
| Süre | 5.959 saniye |
| İlk gerçek darboğaz | Field / type_products_id: izin verilen integer/text/boolean/unsupported yerine üç kez id |

İki hedefli repair sonrası duruldu. Modelin yanlış cevabı düzeltilerek integer'a çevrilmedi. Doğru formatta verilen kararlar iki persisted entity ve products primary key seçimidir; sonraki semantik doğruluk veya backend kabiliyeti ölçülemedi.

Jev Entity/Field arasında gerçek seçim yaptı ve Entity'yi seçti; bu deterministik sırayla aynıydı. Sonraki Field dispatch ve iki forced owner repair tek seçenekliydi; Jev'e gönderilmedi ve orkestrasyon başarısı sayılmadı. Relationship/Constraint/Operation hazır grubuna erişilmedi. Gözlenen conflict=0 bütün graph'ın tutarlı olduğu anlamına gelmez; henüz o kararlar üretilmedi. Eksik 19 sayısı kuyrukta bildirilen ilk 22 soruya aittir; sonraki rol soruları henüz materyalize olmadığından toplam eksik semantik sayısı unknown.

Jev payload audit'i yalnızca rol/scheduling metadata'sı olduğunu doğruladı; semantik Jev kararı sıfır. Golden IR, önceki başarılı model kararları veya compiler çözüm şablonu worker/router'a verilmedi. Aynı M1 compiler/IR ve aynı verifier/41 test değişmedi. M0–M1 kayıtları ve M1-r2 frozen protokolü hash doğrulamasını geçti. Tek gerçek run; başka sürüm veya rerun başlatılmadı.

Ham worker/routing kayıtları evidence.zip içindedir. Secret, env, budget ledger arşivlenmez.
