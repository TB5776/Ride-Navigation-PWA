Ride Navigation PWA

A phone-first, portrait riding interface for bikes and scooters. It combines live GPS speed, turn-by-turn navigation and a 3D vehicle view in an installable Progressive Web App (PWA), designed to sit on a handlebar mount rather than behave like a shrunk-down desktop dashboard.

Status: Work in progress. The core (GPS, speed, Mapbox, routing) works. The current focus is the mobile UI overhaul.

Features
Working now
Live GPS / location tracking
Live speed (km/h)
Mapbox map
Routing and navigation
PWA support with a service worker
Builds and publishes successfully
Planned
Proper portrait, phone-mounted UI overhaul
Park / Ride states with smooth transitions
Tesla-inspired navigation behaviour
Forward-facing map with dynamic zoom
Red/white navigation arrow and blue route line
Live instruction updates
Danger / object representation (perception visualisation)
Cycling and scooter routing modes
Bike and scooter modes with different 3D models and behaviour
Swipeable navigation / visualisation sheet
Settings
Polish, animations and PWA presentation
App states

The design is built around three states:

State	What you see
Park	Full 3D scooter/bike view, "Parked" label, Ride button. No map, safety or navigation.
Ride, stationary (0 km/h)	Rear vehicle view, Mapbox navigation visible, "Where to?" search.
Ride, moving	Live GPS speed, rear vehicle view, perception visualisation, safety warnings (including a large camera-blocked warning), Mapbox navigation.
PARK
  -> full 3D scooter/bike, "Parked", Ride button

RIDE / STATIONARY
  -> 0 km/h, rear vehicle view, Mapbox navigation, "Where to?"

RIDE / MOVING
  -> live GPS speed, rear vehicle view, perception visualisation,
     safety warnings, Mapbox navigation

Design reference screenshots can go in docs/screenshots/ and be linked here.

Tech stack
Web app / PWA with a service worker
Mapbox for the map, routing and navigation
Browser Geolocation API for location and speed
Originally built on Replit; planned hosting on Vercel (or another free host) via GitHub
Getting started
Clone the repo:
bash
   git clone https://github.com/TB5776/Ride-Navigation-PWA.git
   cd Ride-Navigation-PWA
Install dependencies and start the dev server. Check package.json for the exact scripts, for example:
bash
   npm install
   npm run dev
Add your own Mapbox access token (check the source for the environment variable or config it reads). Never commit your token.
Open the app on a phone (or in browser dev tools' mobile view). GPS and PWA install work best over HTTPS.
Service worker / cache note

Earlier versions cached the app shell under the name ride-nav-shell-v1, which could leave the root URL stuck on an old version. The service worker was updated so that:

Navigation HTML is fetched fresh when appropriate
Old ride-nav-shell-v1 caches are migrated and cleaned up
Mapbox, GPS and navigation logic are untouched

If you still see a stale version during development, run this in the browser console:

js
Promise.all([
  caches.delete('ride-nav-shell-v1'),
  navigator.serviceWorker.getRegistration().then(r => r?.unregister())
]).then(() => location.reload())
Roadmap
Fix the mobile viewport / layout foundation (without touching Mapbox, GPS or navigation)
Build the Park / Ride states and transitions
Add the forward-facing map, dynamic zoom and navigation arrow
Add perception visualisation and safety warnings
Add bike / scooter modes and routing profiles
Settings, polish and animations
Deploy from GitHub to Vercel
Development principles
Improve the existing app rather than rebuilding it
Keep everything that already works: Mapbox, GPS, speed, routing, PWA
Make changes incrementally and test after each one
No fake telemetry, fake GPS or placeholder navigation where real functionality exists
Keep a known-working backup before major changes
Repository

github.com/TB5776/Ride-Navigation-PWA

License

Not yet specified.
