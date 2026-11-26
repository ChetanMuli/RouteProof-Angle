import { createContext, useCallback, useContext, useState } from 'react';

const MR = {
  // Navigation & common
  'Dashboard': 'डॅशबोर्ड', 'Campaigns': 'मोहिमा', 'Visits': 'भेटी', 'Drivers': 'ड्रायव्हर', 'Sub-admins': 'सब-अ‍ॅडमिन', 'Vehicles': 'वाहने',
  'Driver-vehicle log': 'ड्रायव्हर-वाहन नोंद', 'Activity log': 'ॲक्टिव्हिटी लॉग', 'Admin': 'अ‍ॅडमिन', 'Sub-admin': 'सब-अ‍ॅडमिन', 'Driver': 'ड्रायव्हर',
  'Log in': 'लॉगिन', 'Log out': 'लॉग आउट', 'Username': 'युजरनेम', 'Username or mobile number': 'युजरनेम किंवा मोबाईल क्रमांक', 'Password': 'पासवर्ड',
  'Close': 'बंद करा', 'Cancel': 'रद्द करा', 'Save': 'सेव्ह करा', 'Saved': 'सेव्ह झाले', 'Back': 'मागे', 'Edit': 'बदला', 'Remove': 'काढा',
  'All': 'सर्व', 'From': 'पासून', 'To': 'पर्यंत', 'Date': 'तारीख', 'Dates': 'तारखा', 'Status': 'स्थिती', 'Name': 'नाव',
  'Full name': 'पूर्ण नाव', 'Mobile number': 'मोबाईल क्रमांक', 'Type': 'प्रकार', 'Owner': 'मालक', 'Details': 'तपशील',
  'Active': 'सक्रिय', 'Inactive': 'निष्क्रिय', 'Paused': 'थांबवलेली', 'Closed': 'बंद', 'Activate': 'सक्रिय करा', 'Deactivate': 'निष्क्रिय करा',
  'In progress': 'सुरू आहे', 'Awaiting review': 'तपासणी बाकी', 'Approved': 'मंजूर', 'Rejected': 'नामंजूर', 'Approve': 'मंजूर करा', 'Reject': 'नामंजूर करा',
  'Reject visit': 'भेट नामंजूर करा', 'Reason': 'कारण', 'Reason for rejecting': 'नामंजूर करण्याचे कारण', 'Wrong username or password': 'युजरनेम किंवा पासवर्ड चुकीचा आहे',
  'Search': 'शोधा', 'Refresh': 'रिफ्रेश', 'Export': 'एक्सपोर्ट', 'Import Excel/CSV': 'Excel/CSV इम्पोर्ट', 'Template': 'टेम्पलेट',
  // Login & OTP
  'See every advertising vehicle where it should be.': 'प्रत्येक जाहिरात वाहन योग्य ठिकाणी आहे का, ते पाहा.',
  'Drivers photograph the vehicle at each stop. GPS, time and address are printed on the photo, and your team reviews them here.': 'ड्रायव्हर प्रत्येक थांब्यावर वाहनाचा फोटो काढतात. GPS, वेळ व पत्ता फोटोवरच छापला जातो आणि तुमची टीम तो येथे तपासते.',
  'Demo project': 'डेमो प्रकल्प', 'Demo logins': 'डेमो लॉगिन', 'Password login': 'पासवर्ड लॉगिन', 'Mobile OTP': 'मोबाईल OTP',
  'Send OTP': 'OTP पाठवा', 'Verify & log in': 'तपासा आणि लॉगिन करा', 'Enter 6-digit OTP': '६ अंकी OTP टाका',
  // Dashboard
  'Today': 'आज', 'Drivers on duty': 'ड्यूटीवरील ड्रायव्हर', '{n} vehicles selected': '{n} वाहने निवडली', 'Visits done': 'पूर्ण भेटी',
  '{n} in progress': '{n} सुरू आहेत', 'Review now': 'आता तपासा', 'Rejected today': 'आज नामंजूर', 'Photos that need a redo': 'पुन्हा काढायचे फोटो',
  'Missed / pending': 'बाकी / सुटलेले', 'Not started yet today': 'आज अजून सुरू नाही', 'Flagged for review': 'फ्लॅग केलेले',
  'Outside radius or short stay': 'अंतराबाहेर किंवा कमी वेळ', "Today's route coverage": 'आजच्या मोहिमांची प्रगती',
  'Latest photos': 'ताजे फोटो', 'No photos yet': 'अजून फोटो नाहीत', 'Photos appear here as soon as drivers upload them.': 'ड्रायव्हरने अपलोड करताच फोटो येथे दिसतात.',
  // Campaigns
  'New campaign': 'नवीन मोहीम', 'Edit campaign': 'मोहीम बदला', 'One campaign per advertiser job, with its route and drivers.': 'जाहिरातदाराच्या प्रत्येक कामासाठी एक मोहीम, तिचा मार्ग व ड्रायव्हरसह.',
  'No campaigns yet': 'अजून मोहिमा नाहीत', 'Create a campaign, then add its route and assign drivers.': 'मोहीम तयार करा, मग तिचा मार्ग जोडा आणि ड्रायव्हर नेमा.',
  'Advertiser': 'जाहिरातदार', 'Campaign': 'मोहीम', 'Stops': 'थांबे', 'Drivers today': 'आजचे ड्रायव्हर', 'Advertiser (client name)': 'जाहिरातदार (क्लायंटचे नाव)',
  'Campaign name': 'मोहिमेचे नाव', 'Start date': 'सुरू तारीख', 'End date': 'शेवटची तारीख',
  'Photo every (minutes) while at a stop': 'थांब्यावर दर किती मिनिटांनी फोटो (मिनिटे)', 'Minimum stay at each stop (minutes)': 'प्रत्येक थांब्यावर किमान वेळ (मिनिटे)',
  'Notes for drivers': 'ड्रायव्हरसाठी सूचना', 'Create campaign': 'मोहीम तयार करा', 'Campaign created': 'मोहीम तयार झाली', 'Campaign updated': 'मोहीम अपडेट झाली',
  'Photo every {n} min at a stop': 'थांब्यावर दर {n} मिनिटांनी फोटो', 'Min stay {n} min': 'किमान {n} मिनिटे थांबा',
  // Route & Map
  'Route': 'मार्ग', 'Route history': 'मार्ग इतिहास', 'Stop': 'थांबा', 'Add stop': 'थांबा जोडा', 'Edit stop': 'थांबा बदला', 'Import route': 'मार्ग इम्पोर्ट करा',
  'Stop name': 'थांब्याचे नाव', 'Address': 'पत्ता', 'Search address on map': 'नकाशावर पत्ता शोधा', 'Click or drag pin on map to set exact stop location': 'नकाशावर क्लिक करा किंवा पिन ड्रॅग करा',
  'Latitude': 'अक्षांश (latitude)', 'Longitude': 'रेखांश (longitude)', 'Allowed distance (metres)': 'परवानगी असलेले अंतर (मीटर)', 'Allowed distance': 'परवानगी असलेले अंतर',
  'Instructions for driver': 'ड्रायव्हरसाठी सूचना', 'Save stop': 'थांबा सेव्ह करा', 'GPS location': 'GPS लोकेशन', 'Missing': 'नाही', 'Move up': 'वर हलवा', 'Move down': 'खाली हलवा',
  'No stops yet': 'अजून थांबे नाहीत', 'Import the route file from your client, or add stops one by one.': 'क्लायंटने दिलेली मार्ग फाईल इम्पोर्ट करा, किंवा थांबे एक-एक करून जोडा.',
  'Read file': 'फाईल वाचा', 'Reading file...': 'फाईल वाचत आहे...', 'Check each stop. Fix names or locations, or remove rows you do not need.': 'प्रत्येक थांबा तपासा. नावे किंवा लोकेशन दुरुस्त करा, नको असलेल्या ओळी काढा.',
  'Save {n} stops': '{n} थांबे सेव्ह करा', '{n} stops added': '{n} थांबे जोडले', 'No GPS location': 'GPS लोकेशन नाही', 'Remove "{name}" from this route?': '"{name}" हा थांबा मार्गातून काढायचा?', 'Stop removed': 'थांबा काढला',
  'No drivers yet': 'अजून ड्रायव्हर नाहीत', 'Add drivers first, then assign them here.': 'आधी ड्रायव्हर जोडा, मग इथे नेमा.', 'Vehicle not selected': 'वाहन निवडले नाही',
  'Save drivers for this day': 'या दिवसासाठी ड्रायव्हर सेव्ह करा', '{n} drivers assigned': '{n} ड्रायव्हर नेमले', 'All stops': 'सर्व थांबे', 'Split stops': 'थांबे वाटा',
  'Export photo report (PDF)': 'फोटो रिपोर्ट (PDF)', 'Export stop list': 'थांब्यांची यादी',
  // People / Vehicles
  'Create drivers once, then assign them to campaigns each day.': 'ड्रायव्हर एकदा तयार करा, मग रोज मोहिमांवर नेमा.',
  'Sub-admins help run campaigns. You decide what each one can do.': 'सब-अ‍ॅडमिन मोहिमा चालवण्यास मदत करतात. प्रत्येकाला काय करता येईल ते तुम्ही ठरवता.',
  'Add driver': 'ड्रायव्हर जोडा', 'Add sub-admin': 'सब-अ‍ॅडमिन जोडा', 'Nobody here yet': 'अजून कोणी नाही', 'Access': 'अधिकार', 'Edit {name}': '{name} बदला',
  'New password (leave empty to keep)': 'नवीन पासवर्ड (तोच ठेवायचा असल्यास रिकामे सोडा)', 'Password (min 6 characters)': 'पासवर्ड (किमान ६ अक्षरे)', 'What can this sub-admin do?': 'हा सब-अ‍ॅडमिन काय करू शकतो?',
  'Manage campaigns and routes': 'मोहिमा व मार्ग व्यवस्थापन', 'Assign drivers': 'ड्रायव्हर नेमणे', 'Manage drivers': 'ड्रायव्हर व्यवस्थापन', 'Manage vehicles': 'वाहन व्यवस्थापन',
  'Approve or reject photos': 'फोटो मंजूर / नामंजूर करणे', 'View and export reports': 'रिपोर्ट पाहणे व एक्सपोर्ट करणे',
  'Drivers pick their vehicle from this list every morning.': 'ड्रायव्हर रोज सकाळी या यादीतून आपले वाहन निवडतात.', 'Add vehicle': 'वाहन जोडा', 'No vehicles yet': 'अजून वाहने नाहीत', 'Vehicle number': 'वाहन क्रमांक', 'Vehicle added': 'वाहन जोडले',
  // Visits & Reports
  'Every stop a driver reached, with arrival and departure photos.': 'ड्रायव्हर पोहोचलेला प्रत्येक थांबा, आगमन व प्रस्थान फोटोंसह.',
  'Visit': 'भेट', 'Arrival': 'आगमन', 'During visit': 'थांब्यावर असताना', 'Departure': 'प्रस्थान',
  'Arrived': 'पोहोचले', 'Left': 'निघाले', 'Photos': 'फोटो', 'Vehicle': 'वाहन', 'GPS': 'GPS', 'Time at stop': 'थांब्यावरील वेळ',
  '{m} m from stop': 'थांब्यापासून {m} मी', 'At the stop': 'थांब्यावर', 'Photo taken away from the stop': 'फोटो थांब्यापासून दूर काढला',
  'Flagged only': 'फक्त फ्लॅग केलेले', 'No photos': 'फोटो नाहीत', 'No visits found': 'भेटी सापडल्या नाहीत', 'Try another date range or filter.': 'दुसरी तारीख श्रेणी किंवा फिल्टर वापरून पाहा.',
  'Summary report': 'सारांश रिपोर्ट', 'By driver': 'ड्रायव्हरनुसार', 'By vehicle': 'वाहनानुसार', 'By campaign': 'मोहिमेनुसार', 'By date': 'तारखेनुसार',
  // Logs
  'A permanent record of which driver had which vehicle, and for which campaign.': 'कोणत्या ड्रायव्हरकडे कोणते वाहन होते आणि कोणत्या मोहिमेसाठी, याची कायमस्वरूपी नोंद.',
  'Selected at': 'निवडल्याची वेळ', 'No records in this period': 'या कालावधीत नोंदी नाहीत',
  'Who changed what, and when. Nothing here can be edited.': 'कोणी काय आणि कधी बदलले. येथील काहीही बदलता येत नाही.',
  'No activity yet': 'अजून ॲक्टिव्हिटी नाही', 'When': 'कधी', 'Who': 'कोणी', 'Action': 'कृती',
  // Driver PWA
  'Hello': 'नमस्कार', "Today's route": 'आजचा मार्ग', 'History': 'इतिहास', "Today's vehicle": 'आजचे वाहन', 'Change': 'बदला',
  'Photo due at {stop}': '{stop} येथे फोटो काढायचा आहे', 'Tap to add the next photo': 'पुढचा फोटो काढण्यासाठी दाबा',
  'No campaign assigned today': 'आज कोणतीही मोहीम नेमलेली नाही', 'Your admin has not assigned you a campaign for today. Pull to refresh later or contact your admin.': 'अ‍ॅडमिनने आज तुम्हाला मोहीम नेमलेली नाही. नंतर पुन्हा तपासा किंवा अ‍ॅडमिनशी बोला.',
  'done': 'पूर्ण', 'Which vehicle do you have today?': 'आज तुमच्याकडे कोणते वाहन आहे?', 'Your photos and reports will be linked to this vehicle number.': 'तुमचे फोटो व रिपोर्ट या वाहन क्रमांकाशी जोडले जातील.',
  'Search vehicle number': 'वाहन क्रमांक शोधा', 'Or enter vehicle number': 'किंवा वाहन क्रमांक टाईप करा', 'No vehicle found. Ask your admin to add it.': 'वाहन सापडले नाही.', 'Confirm vehicle': 'वाहन निश्चित करा',
  'Stop not found': 'थांबा सापडला नाही', 'Back to route': 'मार्गाकडे परत', 'Navigate': 'नकाशावर जा', "I've arrived - take photo": 'मी पोहोचलो - फोटो काढा',
  'Redo stop - take arrival photo': 'पुन्हा प्रयत्न करा - आगमन फोटो काढा', 'Next photo is due now': 'पुढचा फोटो आता काढायचा आहे',
  'Take a photo to show the vehicle is still here.': 'वाहन अजून येथेच आहे हे दाखवण्यासाठी फोटो काढा.', 'Next photo in': 'पुढचा फोटो',
  'Minimum stay met': 'किमान वेळ पूर्ण', 'Stay {m} more min before departure': 'निघण्यापूर्वी अजून {m} मिनिटे थांबा',
  'Add photo': 'फोटो जोडा', 'Leaving - take departure photo': 'निघतोय - प्रस्थान फोटो काढा',
  'Visit finished': 'भेट पूर्ण', 'Your photos': 'तुमचे फोटो', 'Photo saved': 'फोटो सेव्ह झाला', 'Saved offline - will upload automatically when online': 'ऑफलाइन सेव्ह झाले — इंटरनेट आल्यावर आपोआप अपलोड होईल',
  'Syncing offline photos...': 'ऑफलाइन फोटो अपलोड होत आहेत...', '{n} offline photos waiting to upload': '{n} ऑफलाइन फोटो अपलोड बाकी आहेत', 'Sync now': 'आता अपलोड करा',
  'Past days & vehicles': 'मागील दिवस व वाहने', 'Recent visits': 'मागील भेटी', 'No past visits yet': 'अजून मागील भेटी नाहीत',
  // Camera
  'Arrival photo': 'आगमन फोटो', 'Photo during visit': 'थांब्यावरचा फोटो', 'Departure photo': 'प्रस्थान फोटो',
  'Take photo': 'फोटो काढा', 'Retake': 'पुन्हा काढा', 'Upload photo': 'फोटो अपलोड करा', 'Uploading...': 'अपलोड होत आहे...',
  'GPS ready': 'GPS तयार', 'Finding your location...': 'तुमचे लोकेशन शोधत आहे...', 'Use stop location (demo)': 'थांब्याचे लोकेशन वापरा (डेमो)',
  'Use demo camera': 'डेमो कॅमेरा वापरा', 'Camera is not ready yet': 'कॅमेरा अजून तयार नाही',
  'Waiting for GPS. Please try again in a moment.': 'GPS ची वाट पाहत आहे. थोड्या वेळाने पुन्हा प्रयत्न करा.',
  'Live camera is not available here. Use your device camera or demo mode below.': 'येथे लाईव्ह कॅमेरा उपलब्ध नाही. खालील बटण वापरा.',
  'This device cannot share its location': 'हे डिव्हाइस लोकेशन देऊ शकत नाही',
  'Location is blocked. Allow location for this site, then try again.': 'लोकेशन बंद आहे. या साईटसाठी लोकेशनला परवानगी द्या आणि पुन्हा प्रयत्न करा.',
  'Could not get your location. Move to an open area and try again.': 'तुमचे लोकेशन मिळाले नाही. मोकळ्या जागेत जा आणि पुन्हा प्रयत्न करा.',
};

const LangCtx = createContext(null);
export const useLang = () => useContext(LangCtx);

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(localStorage.getItem('lang') === 'mr' ? 'mr' : 'en');

  const setLang = useCallback((l, save = true) => {
    setLangState(l);
    localStorage.setItem('lang', l);
    document.documentElement.lang = l;
    const token = localStorage.getItem('token');
    if (save && token) {
      fetch('/api/auth/language', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ language: l }),
      }).catch(() => {});
    }
  }, []);

  const t = useCallback(
    (key, vars) => {
      let s = (lang === 'mr' && MR[key]) || key;
      if (vars) Object.entries(vars).forEach(([k, v]) => { s = s.split(`{${k}}`).join(v); });
      return s;
    },
    [lang]
  );

  const locale = lang === 'mr' ? 'mr-IN' : 'en-IN';
  const parse = (s) => {
    if (!s) return null;
    const [d, tm = '00:00:00'] = String(s).split(/[ T]/);
    const [y, m, dd] = d.split('-').map(Number);
    const [h, mi] = tm.split(':').map(Number);
    return new Date(y, m - 1, dd, h || 0, mi || 0);
  };
  const fmtDate = (s) => { const d = parse(s); return d ? d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
  const fmtTime = (s) => { const d = parse(s); return d ? d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true }) : ''; };

  return <LangCtx.Provider value={{ lang, setLang, t, fmtDate, fmtTime }}>{children}</LangCtx.Provider>;
}
