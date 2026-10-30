// Copy-desk repairs reviewed on 2026-10-29 (initial audit: 167cec15). Match only the
// supplying source and the affected phrase; new source facts outside it flow
// through unchanged. No event-ID lookup or historical description restore.
// Apply after prose casing and cached/generated blurbs have been selected, so
// raw capitalization and cache hits cannot undo an approved grammar repair.
const EDITS = {
  "San Jose Public Library": {
    title: [
      ["Bilingual Family Storytime/ Hora de Cuentos", "Bilingual Family Storytime / Hora de Cuentos"],
      ["Asistencia de búsqueda de trabajo y crear resumen (currículum)", "Asistencia para buscar trabajo y crear un resumen (currículum)"],
    ],
    description: [
      ["before program starts", "before the program starts"],
      ["Bilingual Family storytime is geared", "Bilingual family storytime is geared"],
      ["invita a todo la familia para participar en actividades de alfabetazión temprana", "invita a toda la familia a participar en actividades de alfabetización temprana"],
      ["juguetes especiales y apropiados para la edad disponible para", "juguetes especiales y apropiados para la edad disponibles para"],
      // Strip only an unfinished suffix. Complete accommodation directions
      // supplied in a later source revision must survive.
      [/\. To request an accommodation under the Americans with Disabilities Act for library-sponsored events, please visit$/g, "."],
      ["Topic list is subject to change", "The topic list is subject to change"],
      ["Floating Drawing & Pepper Experiment Participants", "Floating Drawing & Pepper Experiment. Participants"],
      ["Logic Games Work individually", "Logic Games. Work individually"],
      ["has been Rescheduled for", "has been rescheduled for"],
      ["moved accordingly Sept 1", "moved accordingly. Sept 1"],
      ["Marble Run Fun Harness the", "Marble Run Fun. Harness the"],
      ["Engineering Challenge (please note topic change) In this", "Engineering Challenge (please note topic change). In this"],
      ["Volcanoes (will be rescheduled at a later time) Learn", "Volcanoes (will be rescheduled at a later time). Learn"],
      ["Spike Robotics Code Quest Learn to", "Spike Robotics Code Quest. Learn to"],
      ["Mental Math: Multiplication Children have", "Mental Math: Multiplication. Children have"],
      ["Wind Turbine Engineering In this", "Wind Turbine Engineering. In this"],
      ["Properties of Water (Science from Scientists) Participants", "Properties of Water (Science from Scientists). Participants"],
      ["Oct 27 - TBA Nov 3", "Oct 27 - TBA; Nov 3"],
      ["Aerodynamics Through Paper Planes In this", "Aerodynamics Through Paper Planes. In this"],
      ["concepts of aerodynamics and impact of plane design", "concepts of aerodynamics and the impact of plane design"],
      ["Ozobot Maze Runner Teach your", "Ozobot Maze Runner. Teach your"],
      ["Nov 24 - TBA Dec 1", "Nov 24 - TBA; Dec 1"],
      ["Let's Build Parachutes In this", "Let's Build Parachutes. In this"],
      ["Lego Engineering Challenge In this", "Lego Engineering Challenge. In this"],
      ["cómo: Crea o actualiza tu resumen", "cómo: Crear o actualizar tu resumen"],
      ["; Obtenga ayuda para registrarse en Serv Safe", "; Obtener ayuda para registrarse en Serv Safe"],
      ["formularios de impuestos, etc.) Este es", "formularios de impuestos, etc.). Este es"],
      ["Advice | Information | Referral Social Workers", "Advice | Information | Referral. Social Workers"],
      ["Información | Referencia Este programa", "Información | Referencia. Este programa"],
      ["No Registracion Requerida *Aviso:", "No se requiere registro. *Aviso:"],
      ["recurso que conozcamos y que puede satisfacer", "recurso que conozcamos y que pueda satisfacer"],
      ["an individual, 15-20 minute tutoring session", "an individual, 15-20-minute tutoring session"],
      ["reaches maximum capacity of 50 participants", "reaches the maximum capacity of 50 participants"],
      ["for kindergarten to 3rd grade students", "for students in kindergarten through 3rd grade"],
      ["and division from one- to four-digit numbers", "and division using one- to four-digit numbers"],
      ["confidence and love for Math in young students", "confidence and a love for math in young students"],
      ["For registration information please visit: oneinmath.com This program", "For registration information, please visit oneinmath.com. This program"],
      ["suitable for children K-3rd grade", "suitable for children in K-3rd grade"],
      ["Held in children's area.", "Held in the children's area."],
      ["but if you need advice there are", "but if you need advice, there are"],
      ["an elementary-school age audience", "an elementary-school-age audience"],
      ["a.m. - 12:00 pm. Test your English", "a.m. - 12:00 p.m. Test your English"],
      ["- Canceled for Thanksgiving Appropriate for ages", "- Canceled for Thanksgiving. Appropriate for ages"],
      ["Students in Grades 1–3 Recommended for students", "Students in Grades 1–3. Recommended for students"],
      ["– May 28, 2027 Space is limited,", "– May 28, 2027. Space is limited,"],
      ["Ayuda de lectura Gratis para estudiantes de 1.º a 3.º grado Recomendado para estudiantes", "Ayuda de lectura gratis para estudiantes de 1.º a 3.º grado. Recomendado para estudiantes"],
      ["de mayo de 2027 El espacio es", "de mayo de 2027. El espacio es"],
      ["línea — ¡Es Gratis! Hỗ trợ đọc", "línea — ¡Es gratis! Hỗ trợ đọc"],
      ["học sinh lớp 1–3 Khuyến khích dành", "học sinh lớp 1–3. Khuyến khích dành"],
      ["tháng 5 năm 2027 Số lượng chỗ", "tháng 5 năm 2027. Số lượng chỗ"],
      ["biblioteca; Teléfono móvil; Busca en internet. Este", "biblioteca; Teléfono móvil; Buscar en internet. Este"],
      ["to brush up your computer skills?", "to brush up on your computer skills?"],
      ["para usar dispositivos digitales Voluntaria de biblioteca te brindará", "para usar dispositivos digitales. Una voluntaria de la biblioteca te brindará"],
      ["ayudarte! Ofrecemos asistencia Gratuita en: Creación de", "ayudarte! Ofrecemos asistencia gratuita en: Creación de"],
      ["Languages. Use this e Resource for free with", "Languages. Use this e-resource for free with"],
      ["Rebecca Quan at: Rebecca.quan@sjlibrary.org Có cô chú", "Rebecca Quan at: Rebecca.quan@sjlibrary.org. Có cô chú"],
      ["cô Rebecca Quan: rebecca.quan@sjlibrary.org Hosted by Evergreen", "cô Rebecca Quan: rebecca.quan@sjlibrary.org. Hosted by Evergreen"],
      ["Estudiantes Hispanos de ESL Acompáñenos a este", "Estudiantes Hispanos de ESL: Acompáñenos a este"],
      ["Este programa es Gratuito. Es necesario registrarse.", "Este programa es gratuito. Es necesario registrarse."],
      ["- Canceled for Thanksgiving Recommended for ages", "- Canceled for Thanksgiving. Recommended for ages"],
      ["tijera con Swift Playgrounds ¡Crea tu propio", "tijera con Swift Playgrounds: ¡Crea tu propio"],
      ["3 a 4:30 horas 'Todos pueden programar'", "3 a 4:30 horas. 'Todos pueden programar'"],
      ["thể về sớm. Yêu cầu các phương tiện cho ADA", "thể về sớm."],
      ["their own Halloween Glitter Globe Craft. Please note that", "their own Halloween glitter globe craft. Please note that"],
      ["(This is a drop in activity, or a grab and go craft.) The craft", "(This is a drop-in activity or a grab-and-go craft.) The craft"],
      ["photo. Size: 2 1/2\" Material: Includes self-adhesive", "photo. Size: 2 1/2\". Material: Includes self-adhesive"],
      ["（ELL） （ELL） (ADA) Join us for", "Join us for"],
      ["Starts: August 15, 2026 Meets: Saturdays; Instructor: Annalisa Hernandez Free. Aprende lectura,", "Starts: August 15, 2026; Meets: Saturdays; Instructor: Annalisa Hernandez. Free. Aprende lectura,"],
      ["de agosto de 2026 Días: sábados Instructora: Annalisa Hernández Gratis.", "de agosto de 2026; Días: sábados; Instructora: Annalisa Hernández. Gratis."],
      ["October – Cardboard Nicho Recommended items to", "October – Cardboard Nicho. Recommended items to"],
      ["Embossing Aluminum Food Charms Recommended items to bring: colorful sharpies • December – Felt and Beaded Patches Recommended items to", "Embossing Aluminum Food Charms. Recommended items to bring: colorful Sharpies. • December – Felt and Beaded Patches. Recommended items to"],
      ["– Nicho de cartón Materiales recomendados para", "– Nicho de cartón. Materiales recomendados para"],
      ["de aluminio con relieve Artículos recomendados para", "de aluminio con relieve. Artículos recomendados para"],
      ["es tu comida reconfortante • Diciembre –", "es tu comida reconfortante. • Diciembre –"],
      ["de fieltro y cuentas Artículos recomendados para", "de fieltro y cuentas. Artículos recomendados para"],
      ["11:00 - 12:30 PM Sesión 2: Martes,", "11:00 - 12:30 PM; Sesión 2: Martes,"],
      ["Native American Heritage month themed storytime. Storytime is", "Native American Heritage Month-themed storytime. Storytime is"],
      ["program participant capacity reached. Sessions are", "program participant capacity is reached. Sessions are"],
      ["15 minutes. (A little longer session may", "15 minutes. (A slightly longer session may"],
      ["are no other participants). Participants can also", "are no other participants.) Participants can also"],
      ["intended as an hour long tutoring session.)", "intended as an hour-long tutoring session.)"],
      ["not yet walking confidently, and their caregivers.", "not yet walking confidently and their caregivers."],
      ["of each month. Free, no registration is required.", "of each month. Free. No registration is required."],
      ["ESL course is Free! ESL 501 Reading", "ESL course is free! ESL 501 Reading"],
      ["Seniors interested in learning the basics or need a refresher of how to play Chinese Mahjong are welcome to", "Seniors who are interested in learning the basics of Chinese Mahjong or need a refresher are welcome to"],
      ["will also learn strategy and strengthen communications and sense of community.", "will also learn strategy, strengthen communication skills, and build a sense of community."],
      ["time. Those on waitlist will be considered for no show spots. Late arrivals", "time. Those on the waitlist will be considered for no-show spots. Late arrivals"],
      ["letter. No registration required Parking validation for", "letter. No registration required. Parking validation for"],
      ["the program. E-newsletter signup: Get the inside", "the program. E-newsletter Signup: Get the inside"],
      ["at the program. E Newsletter Signup: Get the", "at the program. E-newsletter Signup: Get the"],
      ["for our monthly e Newsletter, highlighting the latest", "for our monthly e-newsletter, highlighting the latest"],
      ["This program is in-person at Educational Park", "This program is held in person at Educational Park"],
      ["of each session include: Learn basic cooking skills and processes; Food information literacy; Enjoy cooking food with", "of each session include learning basic cooking skills and processes, developing food information literacy, and enjoying cooking food with"],
      ["with our reading Volunteer. Kids are also", "with our reading volunteer. Kids are also"],
      ["interview. No registration required #sjplworkscareer", "interview. No registration required. #sjplworkscareer"],
      ["interaction with our volunteer and it will be held", "interaction with our volunteer. The program will be held"],
      ["Read to Children sign, within the Children's", "Read to Children sign within the Children's"],
      ["and write basic sentences Lớp này sẽ", "and write basic sentences. Lớp này sẽ"],
      ["This is an Open Rehearsal featuring the Chinese Erhu (the Erhu is a traditional", "This is an open rehearsal featuring the Chinese erhu (the erhu is a traditional"],
      ["vocabulary as needed. Program is drop in and free. No registration needed.", "vocabulary as needed. The program is free and offered on a drop-in basis. No registration needed."],
      ["and write basic sentences Free. Registration requested,", "and write basic sentences. Free. Registration requested,"],
      ["grammar, and dialogue. Program is drop in and free. No registration needed.", "grammar, and dialogue. The program is free and offered on a drop-in basis. No registration needed."],
      ["Free. Offered in-person, in English or", "Free. Offered in person, in English or"],
      ["Community Service webpage or more information", "Community Service webpage for more information"],
      ["Sessions take place every 1st and 3rd (& 5th, if applicable) Tuesdays.", "Sessions take place on the 1st and 3rd (& 5th, if applicable) Tuesdays."],
      ["Topics may include creating simple sentence structures, some basic grammar, and build up to writing a simple paragraph.", "Topics may include creating simple sentence structures, learning some basic grammar, and building up to writing a simple paragraph."],
      ["want to learn more/complex English", "want to learn more complex English"],
      ["Young writers, 2nd Grade to 5th Grade (ages 7-11) are invited", "Young writers in 2nd through 5th grade (ages 7-11) are invited"],
      [/generously sponsored by the Pearl Avenue Friends of the Library$/g, "generously sponsored by the Pearl Avenue Friends of the Library."],
      [/send an email to ab\.sjpl@sjlibrary\.org$/g, "send an email to ab.sjpl@sjlibrary.org."],
      ["Students in Kindergarten through 5th grade", "Students in kindergarten through 5th grade"],
      [/Gratis\. Bilingüe$/g, "Gratis. Bilingüe."],
      [/Para mayor información escribe a marcela\.guevara@sjlibrary\.org$/g, "Para mayor información, escribe a marcela.guevara@sjlibrary.org."],
      ["to Grab a Pumpkin Craft. All materials", "to grab a pumpkin craft. All materials"],
      ["For Children 0-10 while supplies last.", "For children 0-10 while supplies last."],
    ],
    blurb: [
      ["a 15-20 minute session", "a 15-20-minute session"],
      ["help brushing up your computer skills", "help brushing up on your computer skills"],
      ["Sing songs, rhymes, and fingerplays with the", "Sing songs and rhymes, and enjoy fingerplays with the"],
    ],
  },
  "Linden Tree Books": {
    description: [
      ["(lots of laughter!) —gather around and enjoy", "(lots of laughter!) — gather around and enjoy"],
      ["beaches of Normandy, France in the famous", "beaches of Normandy, France, in the famous"],
      ["shocking, gruesome, and True stories of the second World War in", "shocking, gruesome, and true stories of the Second World War in"],
      ["Dodging strict nuns, Wanted posters, seasickness, altitude", "Dodging strict nuns, wanted posters, seasickness, altitude"],
      ["for ages 9+! Led by bookseller extraordinaire Lorilee, we hope to introduce", "for ages 9+! The club is led by bookseller extraordinaire Lorilee. We hope to introduce"],
      ["Alexandra Ott, a fast paced adventure novel filled with puzzle solving, a hint of", "Alexandra Ott, a fast-paced adventure novel filled with puzzle-solving, a hint of"],
      ["Materials (paper, pens, etc) will be provided", "Materials (paper, pens, etc.) will be provided"],
      ["workshops led by a talented, published illustrators.", "workshops led by talented, published illustrators."],
    ],
  },
  "Montalvo Arts Center": {
    description: [
      ["RSVP Lowrider Art Showcase", ""],
      ["The Music of ABBA", ""],
    ],
  },
  "San Jose Jazz": {
    blurb: [
      ["Catch Noah & the", "Watch Noah & the"],
    ],
  },
  "Santana Row": {
    description: [
      ["of The Row Line Up to be announced", "of The Row lineup to be announced"],
    ],
  },
  "Heritage Theatre": {
    description: [
      ["in De Ridder, Louisiana and raised in", "in De Ridder, Louisiana, and raised in"],
      ["never experienced a Winter quite like this!", "never experienced a winter quite like this!"],
    ],
    blurb: [
      ["cast members from Whose Line Is It Anyway improvise scenes built", "cast members from \"Whose Line Is It Anyway?\" improvise scenes built"],
    ],
  },
  "Gamble Garden": {
    description: [
      ["One of Gamble Garden's most beloved traditions, our Holiday Luncheons are", "Among Gamble Garden's most beloved traditions, our Holiday Luncheons are"],
    ],
  },
  "Books Inc": {
    blurb: [
      ["her at Books Inc Palo Alto.", "her at Books Inc. Palo Alto."],
    ],
  },
  "Shoreline Amphitheatre": {
    blurb: [
      ["Catch Dan + Shay", "Watch Dan + Shay"],
    ],
  },
  "SAP Center": {
    blurb: [
      ["Catch the Sharks face", "Watch the Sharks face"],
    ],
  },
  "Santa Clara County Library": {
    description: [
      ["Time Required The time needed", "Time Required: The time needed"],
      ["About Sourcewise Since 1973", "About Sourcewise: Since 1973"],
      ["Siblings are welcomed. September 15 October 20 November 17 December 8.", "Siblings are welcome. September 15; October 20; November 17; December 8."],
      ["A long running game of Dungeons", "A long-running game of Dungeons"],
      ["and sometimes shorter oneshots. Teen drop ins to watch the", "and sometimes shorter one-shots. Teen drop-ins to watch the"],
      ["Arts Foundation. Relieve Stress and anxiety; Increase energy and vitality; Improve physical health. Friday afternoons, 1-3 PM In the Auditorium Please note that", "Arts Foundation. Relieve stress and anxiety, increase energy and vitality, and improve physical health. Classes meet Friday afternoons from 1 to 3 PM in the auditorium. Please note that"],
      ["the Flying Rooster arrives there is hope", "the Flying Rooster arrives, there is hope"],
      ["taught at a beginner to intermediate level. Regular attendance", "taught at a beginner-to-intermediate level. Regular attendance"],
      ["in the order of when the assessment is taken. Confirm assessment", "in the order in which the assessments are taken. Confirm assessment"],
      ["their grownups. 10:30-11:00 AM Storytime: 11:00-12:00 PM Stay & Play Thank you to", "their grownups. 10:30-11:00 AM: Storytime; 11:00-12:00 PM: Stay & Play. Thank you to"],
      ["on: October 3rd October 10th. For", "on: October 3rd and October 10th. For"],
      ["at Once and Navalny; a father-to-be tries", "at Once and Navalny, a father-to-be tries"],
      ["wrong. MPA Rating: PG-13 104 minutes. For", "wrong. MPA Rating: PG-13. 104 minutes. For"],
      ["Información y asistencia disponible en inglés, español", "Información y asistencia disponibles en inglés, español"],
      ["Korea by Barbara Demick. (2009) Based on Demick's interviews over a seven year period with six", "Korea by Barbara Demick (2009). The book is based on Demick's interviews over a seven-year period with six"],
      ["registration is required; walk-in while supplies last.", "registration is required; walk in while supplies last."],
      ["email us at ask@lib.sccgov.org Un taller gratuito", "email us at ask@lib.sccgov.org. Un taller gratuito"],
      ["Dance: Bachata & Merengue Class will be", "Dance: Bachata & Merengue. Class will be"],
      ["will guide you and your families through the vital decisions required to secure their future and avoid", "will guide you and your families through the vital decisions required to secure your future and avoid"],
      ["Drive. Schedule an Appointment using QR code below: For More Information email Aprille Walsh at: aprillew@stanford.edu. For accessibility", "Drive. Schedule an appointment using the QR code below. For more information, email Aprille Walsh at aprillew@stanford.edu. For accessibility"],
      ["finish your craft. Although if you like, you", "finish your craft. If you like, you"],
      ["cling with solid tempura paint sticks. All", "cling with solid tempera paint sticks. All"],
      ["for a more laid back viewing, or sit", "for a more laid-back viewing, or sit"],
      ["film is rated PG we recommend ages", "film is rated PG, we recommend ages"],
      ["In this class local maker Bea", "In this class, local maker Bea"],
      ["Each participant will leave with 3 individual soaps and the know-how to make your own at home!", "Each participant will leave with 3 individual soaps and the know-how to make their own at home!"],
      ["body rhymes, songs, very short and simple picture books.", "body rhymes, songs, and very short and simple picture books."],
      ["At our book club meeting we will discuss", "At our book club meeting, we will discuss"],
      ["at Woodland Library for check out.", "at Woodland Library to check out."],
      // End-of-field anchors add sentence punctuation without altering an
      // address, extending a link, or cutting off later source instructions.
      [/email us at (ask@lib\.sccgov\.org|ask@sccl\.org)$/g, "email us at $1."],
      [/envíenos un correo electrónico ask@lib\.sccgov\.org$/g, "envíenos un correo electrónico a ask@lib.sccgov.org."],
    ],
    blurb: [
      ["get help from tutors, basic school supplies provided as space", "get help from tutors; basic school supplies are provided as space"],
    ],
  },
  "Palo Alto City Library": {
    description: [
      ["Note: Teens and Adults only. Use of", "Note: Teens and adults only. Use of"],
      ["and beyond. Keep on hand all", "and beyond. Keep them on hand all"],
      ["کتاب‌های کودک، آناهیتا تمدن ، به ما بپیوندیددر این برنامه با", "کتاب‌های کودک، آناهیتا تمدن، به ما بپیوندید. در این برنامه با"],
      ["library for our drop in tech help Tuesday", "library for our drop-in tech help Tuesday"],
      ["en la Hora Cuentos Bilingüe en", "en la Hora de Cuentos Bilingüe en"],
      ["con movimiento en Español e Inglés. Jueves de 10:30-11", "con movimiento en español e inglés. Jueves de 10:30-11"],
      ["In this workshop folks will learn", "In this workshop, folks will learn"],
      ["Writers resumes for their fourth year on", "Writers resumes for its fourth year on"],
      ["performance with musician and storyteller, Kirk Waller!", "performance with musician and storyteller Kirk Waller!"],
      ["Come join teen-led group NeuroSphere!", "Come join the teen-led group NeuroSphere!"],
      [/Questions\? Email neurosphereyouth@gmail\.com$/g, "Questions? Email neurosphereyouth@gmail.com."],
    ],
    blurb: [
      ["Sing songs, rhymes, and movement activities in", "Sing songs and rhymes, and join movement activities in"],
      ["Kent to international music, no partner or", "Kent to international music; no partner or"],
    ],
  },
  "City of Cupertino": {
    description: [
      ["Deaf and hard of hearing children, along with", "Deaf and hard-of-hearing children, along with"],
      ["about early Cupertino history, the craft of blacksmithing, and learn from our experienced", "about early Cupertino history and the craft of blacksmithing. Learn from our experienced"],
    ],
    blurb: [
      ["for deaf and hard of hearing families.", "for deaf and hard-of-hearing families."],
    ],
  },
  "City Newsletter": {
    title: [
      [/^Celebrate Diwali by Painting Diya$/g, "Celebrate Diwali by Painting Diyas"],
    ],
    blurb: [
      ["Paint clay diya, the small oil lamps", "Paint clay diyas, the small oil lamps"],
      ["similar to Bingo,", "similar to bingo,"],
      ["this drop-in social group, no registration required.", "this drop-in social group. No registration required."],
      ["Dance to line dancing and", "Enjoy line dancing and"],
    ],
    description: [
      ["Paint clay diya, the small oil lamps", "Paint clay diyas, the small oil lamps"],
      ["similar to Bingo.", "similar to bingo."],
      ["Drone programming program using Python at the", "Drone programming with Python at the"],
    ],
  },
  "SJSU Events": {
    description: [
      ["history, culture and artform of Mariachi music.", "history, culture and art form of mariachi music."],
    ],
    blurb: [
      ["history, culture and artform of Mariachi music at SJSU's", "history, culture and art form of mariachi music at SJSU's"],
    ],
  },
  "Ticketmaster": {
    description: [
      ["Lineup* Shoreline Mafia SOB", "Lineup: Shoreline Mafia SOB"],
      ["Kai Bandz Ny Ny *Lineup subject to change", "Kai Bandz Ny Ny. Lineup subject to change."],
      ["Rock En Espanol Night Fri November 6, 9 PM 21+ A night of", "Rock En Espanol Night. Fri, November 6, 9 PM. 21+. A night of"],
    ],
    blurb: [
      ["Greedo, Kamaiyah and more, lineup subject to", "Greedo, Kamaiyah and more; lineup subject to"],
      ["Catch Demetri Martin's standup comedy set at", "Catch Demetri Martin's stand-up comedy set at"],
      ["Catch Suicide Silence, Emmure,", "Watch Suicide Silence, Emmure,"],
    ],
  },
  "Stanford Events": {
    description: [
      ["to celebrate the Fall harvest", "to celebrate the fall harvest"],
      ["music, activties and light bites", "music, activities and light bites"],
      ["and outdoor Rodin Sculptures!", "and outdoor Rodin sculptures!"],
      ["Curator of European Art, Patrick R. Crowley,", "Curator of European Art Patrick R. Crowley,"],
      ["and early 20th century changed the history", "and early 20th centuries changed the history"],
    ],
    blurb: [
      ["live music, activities, and light bites, all welcome.", "live music, activities, and light bites. All are welcome."],
      ["music, activities, and light bites, all welcome.", "music, activities, and light bites. All are welcome."],
    ],
  },
  "NHL": {
    blurb: [
      ["Catch the Sharks skate", "Watch the Sharks skate"],
      ["Catch the Sharks host", "Watch the Sharks host"],
    ],
  },
  "San Jose Theaters": {
    description: [
      ["Love, Music & Emotions Love is more", "Love, Music & Emotions. Love is more"],
    ],
  },
  "Santa Clara University": {
    description: [
      ["at the Forge. Only requirements are closed-toed", "at the Forge. The only requirements are closed-toed"],
      ["By Oscar Wilde Directed by Kimberly Mohne Hill November", "By Oscar Wilde. Directed by Kimberly Mohne Hill. November"],
      [/November 6 - 15 \(Thu-Sat 8 PM, Sun 2 PM\)$/g, "November 6 - 15 (Thu-Sat 8 PM, Sun 2 PM)."],
    ],
  },
};

/** Return an event with only its reviewed title/description/blurb phrases repaired.
 * The source-text cache fingerprint must be computed before this display pass:
 * punctuation repairs do not warrant regenerating already source-bound blurbs. */
export function polishReviewedEventCopy(event) {
  const next = { ...event };
  const fields = EDITS[event.source];
  if (!fields) return next;
  for (const [field, edits] of Object.entries(fields)) {
    if (typeof next[field] !== "string") continue;
    for (const [before, after] of edits) {
      // The reviewed empty descriptions were whole-field title echoes. A
      // later substantive description mentioning that title must survive.
      if (after === "") {
        if (next[field] === before) next[field] = "";
      } else {
        next[field] = next[field].replaceAll(before, after);
      }
    }
  }
  return next;
}
