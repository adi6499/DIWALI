// Greeting presets in many of the languages Diwali is celebrated in. Every
// line on the card (headline, "Dear …" and the message) is in that language's
// own script; the message is editable. Labels name the language in its own
// script, so the list reads the same whatever language the page is in.
export const PRESETS = [
  { id: 'hi', label: 'हिन्दी · शुभ दीपावली', headline: 'शुभ दीपावली', translit: 'Shubh Deepavali', lang: 'hi', dear: 'प्रिय {to},',
    message: 'दीपों की रोशनी आपके जीवन को सुख, समृद्धि और खुशियों से भर दे।' },
  { id: 'dhanteras', label: 'हिन्दी · शुभ धनतेरस', headline: 'शुभ धनतेरस', translit: 'Shubh Dhanteras', lang: 'hi', dear: 'प्रिय {to},',
    message: 'धनतेरस के पावन अवसर पर भगवान धन्वंतरि आपको उत्तम स्वास्थ्य और माँ लक्ष्मी सुख-समृद्धि प्रदान करें।' },
  { id: 'en', label: 'English · Happy Diwali', headline: 'Happy Diwali', translit: 'A festival of light', lang: 'en', dear: 'Dear {to},',
    message: 'May the light of every diya fill your home with joy, good health and prosperity.' },
  { id: 'dhanteras-en', label: 'English · Happy Dhanteras', headline: 'Happy Dhanteras', translit: 'Shubh Dhanteras', lang: 'en', dear: 'Dear {to},',
    message: 'May Dhanvantari bless you with good health and Lakshmi with prosperity. The first wealth is a healthy body.' },
  { id: 'mr', label: 'मराठी · दिवाळीच्या शुभेच्छा', headline: 'दिवाळीच्या हार्दिक शुभेच्छा', translit: 'Diwalichya hardik shubhechha', lang: 'mr', dear: 'प्रिय {to},',
    message: 'ही दिवाळी तुमच्या आयुष्यात आनंद, आरोग्य आणि समृद्धी घेऊन येवो.' },
  { id: 'gu', label: 'ગુજરાતી · શુભ દીપાવલી', headline: 'શુભ દીપાવલી', translit: 'Shubh Deepavali · Saal Mubarak', lang: 'gu', dear: 'પ્રિય {to},',
    message: 'આ દિવાળી અને નવું વર્ષ તમારા જીવનમાં આનંદ, પ્રકાશ અને સમૃદ્ધિ લાવે.' },
  { id: 'bn', label: 'বাংলা · শুভ দীপাবলি', headline: 'শুভ দীপাবলি', translit: 'Shubho Dipaboli', lang: 'bn', dear: 'প্রিয় {to},',
    message: 'দীপাবলির আলো আপনার ঘর আর মন আলোয় ভরিয়ে তুলুক।' },
  { id: 'ta', label: 'தமிழ் · தீபாவளி நல்வாழ்த்துகள்', headline: 'இனிய தீபாவளி நல்வாழ்த்துகள்', translit: 'Iniya Deepavali Nalvazhthukal', lang: 'ta', dear: 'அன்புள்ள {to},',
    message: 'இந்த தீபாவளி உங்கள் வாழ்வில் மகிழ்ச்சியையும் ஒளியையும் வளத்தையும் நிறைக்கட்டும்.' },
  { id: 'te', label: 'తెలుగు · దీపావళి శుభాకాంక్షలు', headline: 'దీపావళి శుభాకాంక్షలు', translit: 'Deepavali Shubhakankshalu', lang: 'te', dear: 'ప్రియమైన {to},',
    message: 'ఈ దీపావళి మీకు, మీ కుటుంబానికి వెలుగు, ఆనందం, సిరిసంపదలు తీసుకురావాలి.' },
  { id: 'kn', label: 'ಕನ್ನಡ · ದೀಪಾವಳಿ ಶುಭಾಶಯಗಳು', headline: 'ದೀಪಾವಳಿ ಹಬ್ಬದ ಶುಭಾಶಯಗಳು', translit: 'Deepavali habbada shubhashayagalu', lang: 'kn', dear: 'ಪ್ರೀತಿಯ {to},',
    message: 'ಈ ದೀಪಾವಳಿ ನಿಮಗೂ ನಿಮ್ಮ ಕುಟುಂಬಕ್ಕೂ ಬೆಳಕು, ಸಂತೋಷ ಮತ್ತು ಸಮೃದ್ಧಿಯನ್ನು ತರಲಿ.' },
  { id: 'ml', label: 'മലയാളം · ദീപാവലി ആശംസകൾ', headline: 'ദീപാവലി ആശംസകൾ', translit: 'Deepavali ashamsakal', lang: 'ml', dear: 'പ്രിയപ്പെട്ട {to},',
    message: 'ദീപങ്ങളുടെ ഈ ഉത്സവം നിങ്ങൾക്ക് സമാധാനവും സന്തോഷവും നൽകട്ടെ.' },
  { id: 'pa', label: 'ਪੰਜਾਬੀ · ਬੰਦੀ ਛੋੜ ਦਿਵਸ', headline: 'ਬੰਦੀ ਛੋੜ ਦਿਵਸ ਦੀਆਂ ਵਧਾਈਆਂ', translit: 'Bandi Chhor Divas diyan vadhaiyan', lang: 'pa', dear: 'ਪਿਆਰੇ {to},',
    message: 'ਇਸ ਬੰਦੀ ਛੋੜ ਦਿਵਸ ਤੇ ਹਰ ਦੀਵਾ ਸਾਨੂੰ ਹਿੰਮਤ ਅਤੇ ਦਇਆ ਦੀ ਯਾਦ ਦਿਵਾਏ।' },
  { id: 'ne', label: 'नेपाली · तिहारको शुभकामना', headline: 'तिहारको शुभकामना', translit: 'Tihar ko shubhakamana', lang: 'ne', dear: 'प्रिय {to},',
    message: 'यो तिहारले तपाईंको जीवनमा उज्यालो, सुस्वास्थ्य र खुसी ल्याओस्।' },
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
