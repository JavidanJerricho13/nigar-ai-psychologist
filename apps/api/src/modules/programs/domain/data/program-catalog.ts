/**
 * Therapy Program Catalog — structured CBT/DBT/Mindfulness courses.
 * Each program is a multi-week curriculum with daily exercises.
 *
 * Programs are Premium+ features.
 */

export interface ProgramExercise {
  title: string;
  description: string;
  prompt: string; // LLM prompt to guide the user through the exercise
  durationMinutes: number;
  type: 'reflection' | 'breathing' | 'journaling' | 'behavioral' | 'cognitive';
}

export interface ProgramDay {
  day: number;
  title: string;
  exercises: ProgramExercise[];
}

export interface ProgramWeek {
  week: number;
  title: string;
  description: string;
  days: ProgramDay[];
}

export interface ProgramDefinition {
  id: string;
  name: string;
  description: string;
  approach: 'cbt' | 'dbt' | 'mindfulness' | 'act';
  totalWeeks: number;
  daysPerWeek: number;
  targetAudience: string;
  weeks: ProgramWeek[];
}

// ===================== CBT ANXIETY PROGRAM =====================

const CBT_ANXIETY: ProgramDefinition = {
  id: 'cbt_anxiety_6w',
  name: 'Narahatlıqla mübarizə (KBT)',
  description: '6 həftəlik koqnitiv-davranış terapiyası proqramı. Narahatlıq və stresslə baş çıxmaq üçün.',
  approach: 'cbt',
  totalWeeks: 6,
  daysPerWeek: 5,
  targetAudience: 'Stress, narahatlıq, gərginlik yaşayan hər kəs üçün',
  weeks: [
    {
      week: 1,
      title: 'Narahatlığını tanı',
      description: 'Bu həftə narahatlığın nə olduğunu, bədəndə necə hiss olunduğunu və triggerlərini öyrənəcəyik.',
      days: [
        {
          day: 1,
          title: 'Narahatlıq nədir?',
          exercises: [
            {
              title: 'Narahatlıq xəritəsi',
              description: 'Narahatlığın bədənində harada hiss olunur? Düşüncələrin nədir?',
              prompt: 'İstifadəçini narahatlığını tanımağa kömək et. Soruş: bədənində harada hiss olunur? Nə vaxt daha güclü olur? Hansı düşüncələr gəlir? Hisslərini təsdiq et və normallaşdır.',
              durationMinutes: 10,
              type: 'reflection',
            },
          ],
        },
        {
          day: 2,
          title: 'Trigger xəritəsi',
          exercises: [
            {
              title: 'Triggerləri müəyyən et',
              description: 'Hansı situasiyalar narahatlığını artırır?',
              prompt: 'İstifadəçidən son 1 həftədə narahat olduğu situasiyaları xatırlamasını xahiş et. Hər birini yazmasına kömək et. Pattern axtarmağa kömək et.',
              durationMinutes: 10,
              type: 'journaling',
            },
          ],
        },
        {
          day: 3,
          title: '4-7-8 nəfəs texnikası',
          exercises: [
            {
              title: 'Nəfəs məşqi',
              description: '4 saniyə nəfəs al, 7 saniyə saxla, 8 saniyə ver.',
              prompt: 'İstifadəçini 4-7-8 nəfəs texnikasına yönləndir. Addım-addım izah et. 3 dövr etməsini xahiş et. Sonra necə hiss etdiyini soruş.',
              durationMinutes: 5,
              type: 'breathing',
            },
          ],
        },
        {
          day: 4,
          title: 'Avtomatik düşüncələr',
          exercises: [
            {
              title: 'Düşüncə jurnalı',
              description: 'Narahat olduğun zaman avtomatik hansı düşüncələr gəlir?',
              prompt: 'KBT düşüncə jurnalını izah et. İstifadəçidən narahatlıq anında ilk ağlına gələn düşüncəni yazmasını xahiş et. Koqnitiv təhrifləri göstər.',
              durationMinutes: 15,
              type: 'cognitive',
            },
          ],
        },
        {
          day: 5,
          title: 'Həftəlik nəticə',
          exercises: [
            {
              title: 'Həftə 1 xülasəsi',
              description: 'Bu həftə nə öyrəndin? Nə hiss edirsən?',
              prompt: 'İstifadəçidən bu həftəki təcrübəni ümumiləşdirməsini xahiş et. Nə yeni öyrəndiyini, hansı təcrübənin ən faydalı olduğunu soruş. Təqdir et və növbəti həftəyə hazırla.',
              durationMinutes: 10,
              type: 'reflection',
            },
          ],
        },
      ],
    },
    {
      week: 2,
      title: 'Koqnitiv təhriflər',
      description: 'Düşüncələrindəki xətaları tanı və dəyişdir.',
      days: [
        { day: 1, title: 'Fəlakətləşdirmə', exercises: [{ title: 'Fəlakət ssenarisi analizi', description: 'Ən pis ssenari nədir? Nə qədər realdır?', prompt: 'İstifadəçinin fəlakətləşdirmə (catastrophizing) meylini müəyyən et. Bir narahatlıq götürüb ən pis, ən yaxşı və ən real ssenariləri yazdır. Ehtimalları qiymətləndir.', durationMinutes: 15, type: 'cognitive' }] },
        { day: 2, title: 'Qara-ağ düşüncə', exercises: [{ title: 'Boz sahəni tap', description: 'Həyat qara və ya ağ deyil — arada çox rəng var.', prompt: 'İstifadəçinin qara-ağ (all-or-nothing) düşüncəsini müəyyən et. Bir situasiya götürüb "hər zaman", "heç vaxt" sözlərini "bəzən", "ola bilər" ilə əvəz et.', durationMinutes: 10, type: 'cognitive' }] },
        { day: 3, title: 'Fikir oxuma', exercises: [{ title: 'Digərlərinin fikirləri', description: 'Başqalarının nə düşündüyünü həqiqətən bilirsən?', prompt: 'İstifadəçinin mind-reading meylini araşdır. "O mənə pis baxdı = məndən xoşlanmır" kimi nümunələr ver. Alternativ izahlar tapmağa kömək et.', durationMinutes: 10, type: 'cognitive' }] },
        { day: 4, title: 'Süzgəcləmə', exercises: [{ title: 'Tam mənzərəni gör', description: 'Yalnız mənfiyə fokuslanırsan?', prompt: 'Mental filter-i izah et. İstifadəçidən son günlərdə baş verən 3 müsbət və 3 mənfi hadisəni yazmasını xahiş et. Balansı göstər.', durationMinutes: 10, type: 'journaling' }] },
        { day: 5, title: 'Həftəlik nəticə', exercises: [{ title: 'Həftə 2 xülasəsi', description: 'Hansı koqnitiv təhrifi özündə gördün?', prompt: 'Bu həftə öyrənilən 4 koqnitiv təhrifi xatırlat. Hansını daha çox istifadə etdiyini soruş. Növbəti həftəyə keçid: düşüncə yenidənqurması.', durationMinutes: 10, type: 'reflection' }] },
      ],
    },
    {
      week: 3,
      title: 'Düşüncə yenidənqurması',
      description: 'Mənfi düşüncələri realist düşüncələrlə əvəz et.',
      days: [
        { day: 1, title: 'ABCDE modeli', exercises: [{ title: 'ABCDE təhlili', description: 'Aktivləşdirici hadisə → İnanc → Nəticə → Mübahisə → Yeni nəticə', prompt: 'KBT ABCDE modelini addım-addım izah et. İstifadəçidən son narahat olduğu situasiyanı bu model ilə təhlil etməsini xahiş et. A=hadisə, B=düşüncə, C=hiss, D=mübahisə, E=yeni hiss.', durationMinutes: 15, type: 'cognitive' }] },
        { day: 2, title: 'Sübut axtarışı', exercises: [{ title: 'Lehinə və əleyhinə sübutlar', description: 'Mənfi düşüncən üçün nə sübut var?', prompt: 'İstifadəçidən bir mənfi düşüncə götürüb 2 sütun çəkməsini xahiş et: bu düşüncəni dəstəkləyən sübutlar vs əleyhinə olan sübutlar. Balansı göstər.', durationMinutes: 15, type: 'cognitive' }] },
        { day: 3, title: 'Nəfəs + dərk', exercises: [{ title: 'Mayndfullnes nəfəs', description: '5 dəqiqəlik diqqətli nəfəs alma.', prompt: 'İstifadəçini 5 dəqiqəlik mayndfullnes nəfəs məşqinə yönləndir. Nəfəsinə diqqət etməsini, düşüncələri müşahidə edib buraxmasını xahiş et.', durationMinutes: 5, type: 'breathing' }] },
        { day: 4, title: 'Dostuna nə deyərdin?', exercises: [{ title: 'Dost perspektivi', description: 'Əgər dostun eyni şeyi yaşasaydı, ona nə deyərdin?', prompt: 'Compassionate reframing: istifadəçidən narahatlığını sanki dostunun problemi kimi gözdən keçirməsini xahiş et. Özünə nə deyərdi? Niyə özünə eyni şəfqəti göstərmir?', durationMinutes: 10, type: 'cognitive' }] },
        { day: 5, title: 'Həftəlik nəticə', exercises: [{ title: 'Həftə 3 xülasəsi', description: 'Düşüncələrini necə yenidən qurmağı öyrəndin?', prompt: 'Bu həftəki texnikaları xatırlat: ABCDE, sübut axtarışı, dost perspektivi. Hansı ən effektiv idi soruş. Növbəti həftə: davranış dəyişikliyi.', durationMinutes: 10, type: 'reflection' }] },
      ],
    },
    {
      week: 4,
      title: 'Davranış eksperimentləri',
      description: 'Kiçik addımlarla narahatlığa meydan oxu.',
      days: [
        { day: 1, title: 'Qaçınma dövrü', exercises: [{ title: 'Qaçınma analizi', description: 'Nədən qaçınırsan? Bu qaçınma sənə kömək edir, yoxsa ziyan verir?', prompt: 'Avoidance cycle-ı izah et. İstifadəçidən narahatlıq səbəbi ilə qaçındığı 3 şeyi siyahıya almasını xahiş et. Qısamüddətli rahatlıq vs uzunmüddətli ziyanı göstər.', durationMinutes: 15, type: 'behavioral' }] },
        { day: 2, title: 'Kiçik addım', exercises: [{ title: 'Cəsarət addımı', description: 'Bu gün 1 kiçik şey et ki, normalda qaçınardın.', prompt: 'İstifadəçidən qaçınma siyahısından ən asan olanı seçməsini xahiş et. Bu gün bunu etməsi üçün plan qur. Narahatlıq 1-10 gözləntisinə bax, sonra real rəqəmi soruş.', durationMinutes: 10, type: 'behavioral' }] },
        { day: 3, title: 'Nəticəni qiymətləndir', exercises: [{ title: 'Eksperiment nəticəsi', description: 'Dünən etdiyin addım necə oldu?', prompt: 'Dünənki davranış eksperimentinin nəticəsini soruş. Gözləntilər vs reallıq. Narahatlıq həqiqətən gözlənilən qədər pis idi? Nə öyrəndin?', durationMinutes: 10, type: 'reflection' }] },
        { day: 4, title: 'Proqressiv ekspozisiya', exercises: [{ title: 'Narahatlıq nərdivanı', description: 'Kiçikdən böyüyə — narahatlıq pilləkənini qur.', prompt: 'Exposure hierarchy izah et. İstifadəçidən qaçındığı bir sahə üçün 5 pillə narahatlıq nərdivanı qurmasını xahiş et (1=ən asan, 5=ən çətin). Plan qur.', durationMinutes: 15, type: 'behavioral' }] },
        { day: 5, title: 'Həftəlik nəticə', exercises: [{ title: 'Həftə 4 xülasəsi', description: 'Cəsarət addımların necə oldu?', prompt: 'Bu həftə qaçınma və cəsarəti müzakirə et. İstifadəçi nə etdi? Gözləntiləri necə dəyişdi? Nə öyrəndi? Növbəti həftə: gündəlik alışqanlıqlar.', durationMinutes: 10, type: 'reflection' }] },
      ],
    },
    {
      week: 5,
      title: 'Gündəlik alışqanlıqlar',
      description: 'Narahatlıqla mübarizə üçün sağlam rutinlər.',
      days: [
        { day: 1, title: 'Səhər rutini', exercises: [{ title: 'Sakit səhər', description: '10 dəqiqəlik səhər rutini qur.', prompt: 'İstifadəçiyə narahatlığı azaldan səhər rutini qurmağa kömək et: 3 dəq nəfəs, 5 dəq journaling, 2 dəq niyyət. Fərdiləşdir.', durationMinutes: 10, type: 'behavioral' }] },
        { day: 2, title: 'Worry time', exercises: [{ title: 'Narahatlıq vaxtı', description: 'Gündə 15 dəqiqə "narahatlıq vaxtı" ayır — qalanını burax.', prompt: 'Scheduled worry time texnikasını izah et. Gündə 1 dəfə 15 dəqiqə narahatlıqlara bax, qalanını "narahatlıq dəftəri"nə yaz. İstifadəçiyə vaxt seçdirdir.', durationMinutes: 10, type: 'cognitive' }] },
        { day: 3, title: 'Bədən hərəkəti', exercises: [{ title: 'Hərəkətlə rahatla', description: '10 dəqiqəlik gəzinti və ya stretching.', prompt: 'Fiziki hərəkətin narahatlığa təsirini izah et. İstifadəçiyə bu gün 10 dəqiqəlik gəzinti etməsini tövsiyə et. Nəticəni soruş.', durationMinutes: 10, type: 'behavioral' }] },
        { day: 4, title: 'Minnətdarlıq', exercises: [{ title: 'Minnətdarlıq jurnalı', description: 'Bu gün nəyə görə minnətdarsan? 3 şey yaz.', prompt: 'Minnətdarlıq journaling izah et. İstifadəçidən bu gün minnətdar olduğu 3 şeyi yazmasını xahiş et. Kiçik şeylər də ola bilər.', durationMinutes: 5, type: 'journaling' }] },
        { day: 5, title: 'Həftəlik nəticə', exercises: [{ title: 'Həftə 5 xülasəsi', description: 'Hansı alışqanlıq sənə ən çox kömək etdi?', prompt: 'Bu həftəki alışqanlıqları xatırlat. Hansını davam etdirmək istəyir? Hansı ən çətin idi? Fərdi plan qur. Növbəti həftə: final.', durationMinutes: 10, type: 'reflection' }] },
      ],
    },
    {
      week: 6,
      title: 'İrəliləyiş və davamlılıq',
      description: 'Öyrəndiklərini möhkəmləndir və gələcək planını qur.',
      days: [
        { day: 1, title: 'İrəliləyiş hesabatı', exercises: [{ title: 'Nə dəyişdi?', description: '6 həftə əvvəl necə hiss edirdin? İndi necə?', prompt: 'İstifadəçidən 6 həftəlik səyahəti xatırlamasını xahiş et. İlk gün vs indi. Nə dəyişdi? Hansı texnikalar ən çox kömək etdi? İrəliləyişi təqdir et.', durationMinutes: 15, type: 'reflection' }] },
        { day: 2, title: 'Alətlər çantası', exercises: [{ title: 'Sənin alətlərin', description: 'Narahatlıq gələndə nə edəcəksən?', prompt: 'İstifadəçiyə fərdi "narahatlıq alətlər çantası" yaratmağa kömək et. 6 həftə ərzində öyrəndiyi texnikalardan 5 ən effektivini seçdir.', durationMinutes: 15, type: 'reflection' }] },
        { day: 3, title: 'Geri dönüş planı', exercises: [{ title: 'Əgər qayıtsa...', description: 'Narahatlıq geri qayıtsa nə edəcəksən?', prompt: 'Relapse prevention plan qur. Erkən xəbərdarlıq əlamətləri, ilk addımlar, kimi çağırmaq. İstifadəçinin fərdi planını yaz.', durationMinutes: 15, type: 'behavioral' }] },
        { day: 4, title: 'Özünə məktub', exercises: [{ title: 'Gələcəkdəki mənə', description: 'Narahat olduğun gələcəkdəki özünə bir məktub yaz.', prompt: 'İstifadəçidən gələcəkdə narahatlıq keçirəcəyi özünə bir məktub yazmasını xahiş et. Nə öyrəndiyini, gücünü, bacarığını xatırlatsın.', durationMinutes: 15, type: 'journaling' }] },
        { day: 5, title: 'Proqramı tamamla', exercises: [{ title: 'Təbrik!', description: '6 həftəlik proqramı bitirdin!', prompt: 'İstifadəçini təbrik et! 6 həftə ərzində nə qədər böyüyüb. Final əhval qiymətləndirməsi ver. Nigar ilə söhbətə dəvət et. Proqramı tamamlandı olaraq işarələ.', durationMinutes: 10, type: 'reflection' }] },
      ],
    },
  ],
};

// ===================== DBT EMOTIONS PROGRAM =====================

const DBT_EMOTIONS: ProgramDefinition = {
  id: 'dbt_emotions_4w',
  name: 'Emosiyaları idarə et (DBT)',
  description: '4 həftəlik dialektik davranış terapiyası proqramı. Güclü emosiyalarla baş çıxmaq üçün.',
  approach: 'dbt',
  totalWeeks: 4,
  daysPerWeek: 5,
  targetAudience: 'Güclü emosiyalar, qəzəb, kədər, impulsiv davranışla mübarizə edənlər üçün',
  weeks: [
    {
      week: 1,
      title: 'Mayndfullnes əsasları',
      description: 'İndiki ana diqqət yetirmək — DBT-nin təməli.',
      days: [
        { day: 1, title: 'Müşahidə et', exercises: [{ title: '5 hiss məşqi', description: '5 şey gör, 4 şey toxun, 3 şey eşit, 2 şey iylə, 1 şey dad.', prompt: '5-4-3-2-1 grounding texnikasını öyrət. İstifadəçini addım-addım yönləndir. Nəticəni soruş.', durationMinutes: 10, type: 'breathing' }] },
        { day: 2, title: 'Təsvir et', exercises: [{ title: 'Emosiya etiketi', description: 'Hissini adlandır — təsvir et, mühakimə etmə.', prompt: 'Emosiya labeling izah et. İstifadəçidən hazırda hiss etdiyini 3 sözlə təsvir etməsini xahiş et. Mühakimə yoxdur — sadəcə təsvir.', durationMinutes: 10, type: 'reflection' }] },
        { day: 3, title: 'İştirak et', exercises: [{ title: 'Tam iştirak', description: 'Bir iş et — tam diqqətinlə.', prompt: 'Mindful engagement: İstifadəçidən gün ərzində 1 işi (yemək, yuyunma, gəzinti) tam diqqətlə etməsini xahiş et. Axşam nəticəni soruş.', durationMinutes: 5, type: 'breathing' }] },
        { day: 4, title: 'Mühakimə etmə', exercises: [{ title: 'Mühakiməsiz müşahidə', description: 'Düşüncələrini izlə — "yaxşı" və ya "pis" demədən.', prompt: 'Non-judgmental awareness izah et. İstifadəçidən 5 dəqiqə düşüncələrini müşahidə etməsini, amma qiymətləndirməməsini xahiş et. Buludlar kimi gəlib keçir.', durationMinutes: 10, type: 'breathing' }] },
        { day: 5, title: 'Həftəlik nəticə', exercises: [{ title: 'Həftə 1 xülasəsi', description: 'Mayndfullnes həftən necə keçdi?', prompt: 'Bu həftə müşahidə, təsvir, iştirak və mühakiməsizliyi müzakirə et. Hansı ən çətin idi? Hansı ən faydalı? Növbəti həftə: emosiya tənzimləmə.', durationMinutes: 10, type: 'reflection' }] },
      ],
    },
    {
      week: 2,
      title: 'Emosiya tənzimləmə',
      description: 'Güclü emosiyalarla sağlam şəkildə baş çıx.',
      days: [
        { day: 1, title: 'Emosiya dalğası', exercises: [{ title: 'Dalğa üzərində sür', description: 'Emosiyalar dalğa kimidir — gəlir və gedir.', prompt: 'Wave surfing metaphor izah et. Emosiyalar dalğa kimidir. Yüksəlir, zirvəyə çatır, azalır. İstifadəçidən son güclü emosiyasını dalğa kimi təsvir etməsini xahiş et.', durationMinutes: 10, type: 'reflection' }] },
        { day: 2, title: 'Əks davranış', exercises: [{ title: 'Opposite action', description: 'Emosiya bir şey istəyir — əksini et.', prompt: 'DBT Opposite Action texnikasını izah et. Qəzəblisənsə → yavaş danış. Kədərlisənsə → aktivləş. İstifadəçidən bu gün 1 dəfə tətbiq etməsini xahiş et.', durationMinutes: 10, type: 'behavioral' }] },
        { day: 3, title: 'TIPP texnikası', exercises: [{ title: 'Soyuq su + nəfəs', description: 'Temperatur, İntensiv hərəkət, Paced breathing, Paired relaxation.', prompt: 'TIPP crisis skill izah et. T=soyuq su üzə, I=intensiv hərəkət 10dəq, P=yavaş nəfəs, P=əzələ gərilmə. İstifadəçidən 1 texnikanı sınmasını xahiş et.', durationMinutes: 10, type: 'behavioral' }] },
        { day: 4, title: 'ABC PLEASE', exercises: [{ title: 'Emosional zəifliyi azalt', description: 'Yığılan emosiya → azaltma üçün sağlam alışqanlıqlar.', prompt: 'ABC PLEASE izah et: Accumulate positive, Build mastery, Cope ahead. PLEASE: PhysicaL illness, Eating, Avoid drugs, Sleep, Exercise. İstifadəçidən hər birini qiymətləndirməsini xahiş et.', durationMinutes: 15, type: 'behavioral' }] },
        { day: 5, title: 'Həftəlik nəticə', exercises: [{ title: 'Həftə 2 xülasəsi', description: 'Hansı emosiya tənzimləmə texnikası ən çox kömək etdi?', prompt: 'Bu həftənin texnikalarını xatırlat: dalğa sürfing, əks davranış, TIPP, ABC PLEASE. Hansı ən çox kömək etdi? Növbəti həftə: stressə dözümlülük.', durationMinutes: 10, type: 'reflection' }] },
      ],
    },
    {
      week: 3,
      title: 'Stressə dözümlülük',
      description: 'Çətin anlarda dözüm göstərmək üçün krizis bacarıqları.',
      days: [
        { day: 1, title: 'STOP texnikası', exercises: [{ title: 'Dayan. Nəfəs al. Müşahidə et. Davam et.', description: 'Krizis anında 4 addım.', prompt: 'DBT STOP skill izah et: Stop, Take a breath, Observe, Proceed mindfully. İstifadəçidən son stressli anını bu modellə analiz etməsini xahiş et.', durationMinutes: 10, type: 'cognitive' }] },
        { day: 2, title: 'Diqqəti yayındır', exercises: [{ title: 'ACCEPTS', description: 'Activities, Contributing, Comparisons, Emotions, Pushing away, Thoughts, Sensations.', prompt: 'ACCEPTS distraction technique izah et. İstifadəçidən hər kateqoriyadan 1 fərdi nümunə verməsini xahiş et.', durationMinutes: 10, type: 'behavioral' }] },
        { day: 3, title: 'Özünə şəfqət', exercises: [{ title: 'IMPROVE the moment', description: 'Imagery, Meaning, Prayer, Relaxation, One thing, Vacation, Encouragement.', prompt: 'IMPROVE texnikasını izah et. İstifadəçidən bu gün 2 elementini sınamasını xahiş et.', durationMinutes: 10, type: 'reflection' }] },
        { day: 4, title: 'Radikal qəbul', exercises: [{ title: 'Dəyişdirə bilmədiklərini qəbul et', description: 'Radikal qəbul — acıya əzab əlavə etmə.', prompt: 'Radical acceptance izah et: ağrı × qəbullanmama = əzab. İstifadəçidən həyatında 1 şeyi radikal qəbul etməyə çalışmasını xahiş et. Hisslərini müzakirə et.', durationMinutes: 15, type: 'cognitive' }] },
        { day: 5, title: 'Həftəlik nəticə', exercises: [{ title: 'Həftə 3 xülasəsi', description: 'Stressə dözümlülüyün artdı?', prompt: 'Bu həftəni xatırlat: STOP, ACCEPTS, IMPROVE, radikal qəbul. Hansı ən effektiv idi? Növbəti həftə: insanlarla münasibətlər.', durationMinutes: 10, type: 'reflection' }] },
      ],
    },
    {
      week: 4,
      title: 'İnsanlararası effektivlik',
      description: 'Sağlam münasibətlər qurmaq və qorumaq.',
      days: [
        { day: 1, title: 'DEAR MAN', exercises: [{ title: 'Nə istədiyini de', description: 'Describe, Express, Assert, Reinforce, Mindful, Appear confident, Negotiate.', prompt: 'DEAR MAN assertiveness texnikasını izah et. İstifadəçidən həyatında istədiyi amma deyə bilmədiyi 1 şeyi DEAR MAN formatında yazmasını xahiş et.', durationMinutes: 15, type: 'behavioral' }] },
        { day: 2, title: 'GIVE', exercises: [{ title: 'Münasibəti qoru', description: 'Gentle, Interested, Validate, Easy manner.', prompt: 'GIVE relationship maintenance texnikasını izah et. İstifadəçidən bu gün 1 yaxınına GIVE prinsiplərini tətbiq etməsini xahiş et.', durationMinutes: 10, type: 'behavioral' }] },
        { day: 3, title: 'FAST', exercises: [{ title: 'Özünə hörmət', description: 'Fair, no Apologies, Stick to values, Truthful.', prompt: 'FAST self-respect texnikasını izah et. İstifadəçidən son həftə harda öz dəyərlərindən güzəştə getdiyini müzakirə etməsini xahiş et.', durationMinutes: 10, type: 'reflection' }] },
        { day: 4, title: 'Sərhədlər', exercises: [{ title: 'Sağlam sərhəd qoy', description: '"Yox" demək — bacarıqdır.', prompt: 'Boundary setting izah et. İstifadəçidən 3 sahədə daha güclü sərhəd qoymaq istədiyini yazmasını xahiş et. Hər biri üçün cümlə formalaşdır.', durationMinutes: 15, type: 'behavioral' }] },
        { day: 5, title: 'Proqramı tamamla', exercises: [{ title: 'Təbrik!', description: '4 həftəlik DBT proqramını bitirdin!', prompt: 'İstifadəçini təbrik et! 4 həftəni xatırlat: mayndfullnes, emosiya tənzimləmə, stressə dözümlülük, insanlarla effektivlik. Final əhval qiymətləndirməsi. Alətlər çantası qur.', durationMinutes: 15, type: 'reflection' }] },
      ],
    },
  ],
};

export const PROGRAM_CATALOG: ProgramDefinition[] = [CBT_ANXIETY, DBT_EMOTIONS];

export const PROGRAM_MAP = new Map<string, ProgramDefinition>(
  PROGRAM_CATALOG.map((p) => [p.id, p]),
);
