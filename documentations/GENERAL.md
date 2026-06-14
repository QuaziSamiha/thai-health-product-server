1. How does the Backend know the language?
The backend doesn't "watch" the button. Instead, every time the frontend makes an API call, it tells the backend which language it wants. A senior developer uses one of these three methods:

Method A: The Header (Cleanest & Most Professional)
When the user clicks the language button, the frontend saves that choice (in a Cookie or LocalStorage). Every request sent via Axios or Fetch includes a custom header.

Header: x-custom-lang: th or Accept-Language: th

NestJS Side: You create a Middleware or an Interceptor that reads this header and attaches the langCode to the request object.

Method B: The Query Parameter (Easiest for Debugging)
The frontend appends the language to the URL.

URL: http://localhost:5001/api/v1/categories?lang=th

NestJS Side: You extract it using @Query('lang').

Method C: The Slug itself
Since your slugs are unique per language (e.g., /en/vitamins vs /th/วิตามิน), the backend can look up the slug in the CategoryTranslation table. It will naturally find the record associated with the correct language.

. Does the Admin have to fill both languages?
In a perfect world, yes. But in reality, an Admin might only know one language. Here is how senior developers design the Admin Panel Flow:

Scenario 1: Strict Validation
The Admin form has two tabs (English and Thai). The "Save" button stays disabled until both are filled. This ensures your site never has "empty" sections.

Scenario 2: Master Language + Fallback (Most Common)
Admin fills out the English data (the "Master" language).

The backend saves the English translation.

For the Thai side:

Option A: You leave it blank. When a Thai user visits, your backend code sees the Thai translation is missing and automatically returns the English one (the Fallback).

Option B: You integrate a Google Translate API in the backend. When English is saved, the backend automatically generates a "Draft" Thai translation that the Admin can later polish.