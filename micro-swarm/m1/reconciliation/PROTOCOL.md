# M1-r1 — bounded graph reconciliation

Bu, M1'in max_reconsiderations=0 tek-geçiş koşumunu geriye dönük değiştirmez. İlk negatif sonuç, 124 ham karar, IR ve frozen kaynaklar korunur. Bu ayrı sürüm, aynı Jev modeliyle çelişkiyi en fazla iki yeni typed decision request'inde uzlaştırmayı dener. Kaynak/compiler/verifier aynı hash'lerdedir. Kabul testleri ilk M1 koşumunda hiç yürütülmemiştir; bu sürümde de kolaylaştırılmaz.

Tek desteklenen genel tutarlılık kuralı: idempotent create operation'ının seçtiği key, entity schema'da unique olmalıdır (mevcut compiler invariant'ı). İsim veya task'a özel dal yoktur. Graph, çelişen entity.field ve onu kullanan operation'ları türetir. Jev orijinal gereksinime dayanarak (a) unique ilan et, (b) replay semantiği istenmiyorsa idempotency'yi kaldır veya (c) çözülemedi seçer. Hangi seçimin test geçireceği engine tarafından seçilmez. Unresolved değişiklik yapmaz. Her değişiklik için önce/sonra/probability/karar kökeni tutulur.

Bu kural bir compiler consistency kuralıdır; yalnız başına derin yeni semantik keşif değildir. Kuraldan benzersizlik otomatik de türetilebilirdi; bu sürüm otomatik türetme yerine açık Jev kararı ister. Compiler'ın sağladığı bütün transaction/idempotency mekanikleri önceki kontrolle aynıdır.

API key/endpoint/model, aynı $0.05 kampanya tavanı ve parent budget ledger kullanılır; eski harcama silinmez. En fazla 2 round; geçerli IR ilk elde edildiğinde compile ve aynı gerçek HTTP/SQLite/concurrency/restart suite'i çalışır. Test başarısızsa compiler/policy değiştirilmez, yeni retry başlamaz. Golden/human control IR bu runner tarafından okunmaz. M1-r1 protokolü ve kodu yeni request'ten önce ayrıca hash ile dondurulur.
