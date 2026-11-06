// Greeting presets in many of the languages Diwali is celebrated in. The
// headline is in the language's own script; the message is editable.
export const PRESETS = [
  { id: 'hi', label: 'Hindi · शुभ दीपावली', headline: 'शुभ दीपावली', translit: 'Shubh Deepavali', lang: 'hi',
    message: 'दीपों की रोशनी आपके जीवन को सुख, समृद्धि और खुशियों से भर दे।' },
  { id: 'dhanteras', label: 'Dhanteras · शुभ धनतेरस', headline: 'शुभ धनतेरस', translit: 'Shubh Dhanteras', lang: 'hi',
    message: 'धनतेरस के पावन अवसर पर भगवान धन्वंतरि आपको उत्तम स्वास्थ्य और माँ लक्ष्मी सुख-समृद्धि प्रदान करें।' },
  { id: 'dhanteras-en', label: 'Dhanteras · Happy Dhanteras (English)', headline: 'Happy Dhanteras', translit: 'Shubh Dhanteras', lang: 'en',
    message: 'May Dhanvantari bless you with good health and Lakshmi with prosperity. The first wealth is a healthy body.' },
  { id: 'en', label: 'English · Happy Diwali', headline: 'Happy Diwali', translit: 'A festival of light', lang: 'en',
    message: 'May the light of every diya fill your home with joy, good health and prosperity.' },
  { id: 'mr', label: 'Marathi · दिवाळीच्या शुभेच्छा', headline: 'दिवाळीच्या हार्दिक शुभेच्छा', translit: 'Diwalichya hardik shubhechha', lang: 'mr',
    message: 'ही दिवाळी तुमच्या आयुष्यात आनंद, आरोग्य आणि समृद्धी घेऊन येवो.' },
  { id: 'gu', label: 'Gujarati · શુભ દીપાવલી', headline: 'શુભ દીપાવલી', translit: 'Shubh Deepavali · Saal Mubarak', lang: 'gu',
    message: 'May this Diwali and the New Year bring you joy, light and prosperity.' },
  { id: 'bn', label: 'Bengali · শুভ দীপাবলি', headline: 'শুভ দীপাবলি', translit: 'Shubho Dipaboli', lang: 'bn',
    message: 'May the lamps of Diwali light up your home and your heart.' },
  { id: 'ta', label: 'Tamil · தீபாவளி நல்வாழ்த்துகள்', headline: 'இனிய தீபாவளி நல்வாழ்த்துகள்', translit: 'Iniya Deepavali Nalvazhthukal', lang: 'ta',
    message: 'Wishing you a joyful Deepavali, from the first oil bath at dawn to the last lamp at night.' },
  { id: 'te', label: 'Telugu · దీపావళి శుభాకాంక్షలు', headline: 'దీపావళి శుభాకాంక్షలు', translit: 'Deepavali Shubhakankshalu', lang: 'te',
    message: 'May this Deepavali bring light, happiness and prosperity to you and your family.' },
  { id: 'kn', label: 'Kannada · ದೀಪಾವಳಿ ಶುಭಾಶಯಗಳು', headline: 'ದೀಪಾವಳಿ ಹಬ್ಬದ ಶುಭಾಶಯಗಳು', translit: 'Deepavali habbada shubhashayagalu', lang: 'kn',
    message: 'Wishing you and your family a bright and happy Deepavali.' },
  { id: 'ml', label: 'Malayalam · ദീപാവലി ആശംസകൾ', headline: 'ദീപാവലി ആശംസകൾ', translit: 'Deepavali ashamsakal', lang: 'ml',
    message: 'May the festival of lights bring you peace and happiness.' },
  { id: 'pa', label: 'Punjabi · ਬੰਦੀ ਛੋੜ ਦਿਵਸ', headline: 'ਬੰਦੀ ਛੋੜ ਦਿਵਸ ਦੀਆਂ ਵਧਾਈਆਂ', translit: 'Bandi Chhor Divas diyan vadhaiyan', lang: 'pa',
    message: 'On this Day of Liberation, may every lamp remind us of courage and compassion.' },
  { id: 'ne', label: 'Nepali · तिहारको शुभकामना', headline: 'तिहारको शुभकामना', translit: 'Tihar ko shubhakamana', lang: 'ne',
    message: 'Wishing you light, health and happiness this Tihar.' },
];

export const ACCENTS = {
  gold: { main: '#d9b25f', soft: '#f1dfae' },
  marigold: { main: '#f29a2e', soft: '#ffd49a' },
  rose: { main: '#e07a9a', soft: '#f6c6d4' },
};

export const STYLES = ['courtyard', 'diya', 'rangoli', 'fireworks'];

export function presetById(id) {
  return PRESETS.find((p) => p.id === id) || PRESETS[0];
}
