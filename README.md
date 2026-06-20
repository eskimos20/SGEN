# SGEN - Statistics Generator

A comprehensive training statistics application with Intervals.icu and OpenAI integration for athletes and coaches.

## Video Demo

Watch the application in action on YouTube: [SGEN App Demo](https://www.youtube.com/watch?v=TfzTuzfuNyI)

## Features

### Core Features
- **User Management**: Admin can create/delete users, users must change default password on first login
- **Intervals.icu Integration**: Fetch all training data (activities, wellness, events, power curves) from your Intervals.icu account
- **OpenAI Integration**: AI-powered training analysis (user-configurable with your own OpenAI API key)
- **Training Calendar**: Drag-and-drop calendar with workout visualization and mobile support
- **Fitness Charts**: CTL/ATL/TSB tracking, HRV, sleep data, and power curve analysis

### Workout Management
- **Search Workouts**: Search workouts from the shared library or create your own:
  - `/backend/workout-library/` (main library - **shared across all users**)
  - `/backend/custom-workout-library/` (custom user workouts - **personal to each user**)
- **Workout Creator**: Visual drag-and-drop workout builder with real-time TSS calculation and power zones
- **Workout Scheduling**: Schedule workouts directly to your training calendar

#### Shared Workout Library (Global Access)

Workouts placed in `workout-library/` are **automatically shared across all users** of the application. This is ideal for:
- Coaches sharing workouts with their athletes
- Teams using common workout libraries
- Organizations providing standardized training plans

**Sport Type Conversion:** The same workout library is used for both cycling and running. When scheduling a workout for a "Run" activity, the application automatically converts the workout by changing `<sportType>bike</sportType>` to `<sportType>run</sportType>` in the ZWO file.

**Required Folder Structure:**

```
workout-library/
├── Endurance/          # Long aerobic workouts
├── Tempo/              # Tempo zone workouts
├── SweetSpot/          # Sweet spot training
├── Threshold/          # Threshold intervals
├── VO2Max/             # VO2 max intervals
├── Anaerobic/          # Anaerobic capacity
└── Sprint/             # Sprint workouts
```

**File Format:** Place `.zwo` files (Zwift workout files) in the appropriate category folders. The application automatically parses and displays them in Search Workouts for **all users**.

**Note:** Workouts in `/backend/custom-workout-library/` are personal to each user and not shared.

### Athlete Tools
- **Nutrition Calculator**: BMR/TDEE calculations with activity-based recommendations
- **Gear Management**: Track equipment, maintenance schedules, and costs
- **Gear Maintenance**: Schedule and track maintenance intervals with notifications
- **Achievements System**: Gamified training milestones and progress tracking
- **Performance Analytics**: Detailed performance metrics and trend analysis
- **Athlete Profile**: Configure FTP, weight, power zones, and sport preferences
- **Sports Configuration**: Add sports, map activity types to sports, and configure heart rate / power zones, LTHR, and max HR under Statistics

### Advanced Features
- **Weather Integration**: Real-time weather forecasts via SMHI (Swedish Meteorological and Hydrological Institute) — up to 10 days of data including precipitation, wind, cloud cover, and thunderstorm probability
- **BikeFit Analysis**: AI-powered pose detection using MediaPipe for automatic bike position analysis with personalized recommendations
- **System Monitoring**: Real-time CPU, memory, and disk usage tracking for administrators (updates every 3 seconds)
- **Android App**: Capacitor-based Android app with APK download
- **Responsive Design**: Optimized for both desktop and mobile with React.memo performance optimizations
- **JWT Authentication**: Secure JWT-based authentication with role-based access control

## Tech Stack

### Backend
- **Java**: 21 (LTS)
- **Spring Boot**: 3.5.13
- **Database**: H2 (file-based, `./data/sgen`)
- **ORM**: Hibernate / Spring Data JPA
- **Security**: Spring Security with JWT (jjwt 0.12.6)
- **Build Tool**: Maven
- **External APIs**: Intervals.icu, OpenAI, SMHI (weather)

### Frontend
- **Framework**: React 18.2
- **Build Tool**: Vite 5
- **Styling**: TailwindCSS 3.4
- **Charts**: Recharts 2.10
- **Maps**: Leaflet 1.9 + React-Leaflet
- **Icons**: Lucide React
- **HTTP Client**: Axios
- **Date Handling**: date-fns
- **Markdown**: react-markdown + remark-gfm

### Mobile
- **Framework**: Capacitor 6
- **Platforms**: Android
- **Features**: Camera, Filesystem, Preferences, Share

### AI/ML
- **Pose Detection**: MediaPipe Pose
- **AI Analysis**: OpenAI GPT models
- **Supported Models**: GPT-4, GPT-4o, GPT-5 series, o1, o3, o4-mini, and more

### Performance Optimizations
- React.memo for component memoization
- useMemo/useCallback for expensive calculations
- Calendar data caching with Context API
- O(n) optimized calendar operations

## Available Scripts

### Linux/macOS Scripts

| Script | Description |
|--------|-------------|
| `./rebuild-and-start.sh` | **Development**: Builds frontend, copies to backend, builds Android APK (if SDK available), starts Spring Boot server |
| `./deploy-to-server.sh` | **Deployment**: Deploys to production server with systemd service management. Automatically calls `sync-version.sh` |
| `./sync-version.sh` | **Version Sync**: Syncs version from `pom.xml` to Android `build.gradle` and frontend `package.json` (called automatically by deploy) |
| `./install-ubuntu.sh` | **Setup**: Installs Java 21, Maven, and Node.js 20 on Ubuntu/Debian |

### Script Details

**`deploy-to-server.sh`** - Main deployment script:
1. Stops the systemd service
2. Backs up old JAR
3. Clones repository from GitHub
4. **Calls `sync-version.sh` to sync versions**
5. Builds frontend with Android APK
6. Builds backend JAR
7. Copies to server directory
8. Starts systemd service

**`rebuild-and-start.sh`** - Local development:
1. Builds frontend with Vite
2. Copies to backend static resources
3. Builds Android APK (if SDK available)
4. Starts Spring Boot server on port 8084

Both scripts automatically install Android SDK if not present.

### Environment Variables

All scripts read from `.env` file or shell environment:
- `JWT_SECRET` - Required for production (min 32 chars)
- `CORS_ALLOWED_ORIGINS` - Comma-separated allowed domains
- `VITE_API_URL` - API URL for Android app builds
- `ANDROID_SDK_ROOT` - Android SDK path (auto-installed if missing)

## Project Structure

### Frontend (`/frontend/src`)

```
├── api/              # Axios API configuration
├── components/       # Reusable UI components (React.memo optimized)
│   ├── CalendarModals.jsx      # Consolidated calendar modals
│   ├── CalendarGrid.jsx        # Calendar grid with drag-and-drop
│   ├── CalendarHeader.jsx      # Calendar navigation header
│   ├── ActivityDetailsView.jsx # Activity detail display
│   ├── EventDetailModal.jsx    # Event/workout detail modal
│   ├── FitnessChart.jsx        # CTL/ATL/TSB fitness charts
│   ├── WorkoutChart.jsx        # Workout power/HR visualization
│   ├── SchedulerModal.jsx      # Training scheduler
│   ├── GearList.jsx            # Equipment management
│   ├── StatisticsCharts.jsx    # FTP/VO2Max charts
│   ├── WeatherWidget.jsx       # Weather display
│   ├── AchievementNotifier.jsx # Achievement notifications
│   └── ...
├── context/          # React context providers
│   ├── AuthContext.jsx         # Authentication state
│   └── CalendarContext.jsx     # Calendar data caching
├── hooks/            # Custom React hooks
│   ├── useCalendarState.js     # Calendar state management
│   ├── useCalendarHandlers.js  # Calendar event handlers
│   ├── useCalendarDragDrop.js  # Drag-and-drop logic
│   ├── useCalendarModalState.js # Modal state management
│   ├── useStatisticsState.js   # Statistics state
│   └── ...
├── pages/            # Main page components
│   ├── Calendar.jsx            # Training calendar (refactored)
│   ├── Statistics.jsx          # Statistics dashboard
│   ├── Dashboard.jsx           # Overview dashboard
│   ├── SearchWorkouts.jsx      # Workout library search
│   ├── WorkoutCreator.jsx      # Visual workout builder
│   ├── Nutrition.jsx           # Nutrition calculator
│   ├── Gear.jsx                # Gear management
│   ├── BikeFit.jsx             # Bike position analysis
│   ├── Achievements.jsx        # Achievement tracking
│   ├── AdminPanel.jsx          # Admin interface
│   ├── Monitoring.jsx          # System monitoring (admin only)
│   ├── Profile.jsx             # User profile and settings
│   ├── Login.jsx               # Authentication
│   └── ChangePassword.jsx      # Password change (first login)
├── components/       # Reusable UI components
│   ├── admin/        # Admin-specific components
│   │   ├── UsersTab.jsx        # User management
│   │   └── DebugTab.jsx        # Debug information
│   ├── calendar/     # Calendar-specific components
│   ├── shared/       # Shared layout components
│   │   └── Layout.jsx          # Main app layout with navigation
│   └── ...
├── services/         # Business logic services
│   ├── calendarService.js      # Calendar operations (O(n) optimized)
│   └── statisticsService.js    # Statistics operations
└── utils/            # Shared utility functions
    ├── calendarUtils.js        # Calendar date utilities
    ├── athleteUtils.js         # Athlete calculations
    ├── workoutUtils.js         # Workout metrics (TSS, IF, NP)
    ├── statisticsDataUtils.js  # Statistics data processing
    └── zoneUtils.js            # Power/HR zone utilities
```

### Backend (`/backend/src/main/java/com/sgen`)

```
├── controller/       # REST API controllers
│   ├── AdminController.java       # User management (admin only)
│   ├── AthleteController.java     # Athlete profile & sports config
│   ├── AuthController.java        # Authentication endpoints
│   ├── BikeFitController.java     # BikeFit analysis endpoints
│   ├── CalendarController.java    # Calendar events management
│   ├── DownloadController.java    # APK download endpoint
│   ├── GearController.java        # Gear management
│   ├── GearMaintenanceController.java  # Maintenance tracking
│   ├── PerformanceController.java # Performance analytics
│   ├── StatisticsController.java  # Statistics, calendar & AI endpoints
│   ├── SystemController.java     # System monitoring (admin)
│   ├── UserController.java         # User profile & settings
│   ├── VersionController.java     # App version endpoint
│   ├── WeatherController.java     # Weather forecast endpoints
│   └── WorkoutController.java     # Workout library endpoints
├── service/          # Business logic
│   ├── AIUsageService.java        # AI usage tracking & pricing
│   ├── AchievementNotificationService.java  # Achievement notifications
│   ├── AchievementService.java    # Achievement system
│   ├── AppSettingsService.java    # Application settings
│   ├── BikeFitAnalysisService.java # BikeFit AI analysis
│   ├── BikeFitService.java         # BikeFit processing
│   ├── CalendarEventService.java   # Calendar operations
│   ├── CustomWorkoutService.java   # Custom workout management
│   ├── GearMaintenanceService.java # Gear maintenance tracking
│   ├── IntervalsService.java       # Intervals.icu API integration
│   ├── OpenAIService.java          # OpenAI API integration
│   ├── PerformanceService.java     # Performance analytics
│   ├── PromptService.java          # AI prompt management
│   ├── SmhiForecastService.java    # SMHI weather forecasts
│   ├── SmhiStationService.java     # SMHI station search
│   ├── UserService.java            # User management
│   ├── WeatherService.java         # Weather data management
│   ├── WorkoutLibraryService.java  # Workout library (cycling)
│   └── ZwoParser.java              # ZWO file parser
├── config/           # Configuration classes
│   ├── SecurityConfig.java         # Spring Security config
│   ├── SpaWebConfig.java          # SPA routing support
│   └── DataInitializer.java       # Default data initialization
├── entity/           # JPA entities
│   ├── User.java                   # User entity
│   ├── Gear.java                   # Equipment tracking
│   ├── CalendarEvent.java          # Calendar events
│   ├── Sport.java                  # Sports configuration
│   └── ...
└── resources/
    ├── workout-library/             # Optional: ZWO workouts (cycling & running)
    │   ├── Endurance/
    │   ├── Tempo/
    │   ├── SweetSpot/
    │   ├── Threshold/
    │   ├── VO2Max/
    │   ├── Anaerobic/
    │   └── Sprint/
```

## Getting Started

### Prerequisites

- **Java**: 21+ (OpenJDK recommended)
- **Node.js**: 18+ (Node 20 recommended)
- **Maven**: 3.8+
- **Android SDK**: Optional, for mobile app builds (auto-installed by scripts)

### Environment Variables

Create a `.env` file in project root (see `.env.example`):

```bash
# Required for production
JWT_SECRET=your-256-bit-secret-key-minimum-32-characters
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,https://your-domain.com

# Optional for Android app builds
VITE_API_URL=http://your-server:8084/api
ANDROID_SDK_ROOT=/path/to/android-sdk
```

### Quick Start (Development)

**Linux/macOS:**
```bash
./rebuild-and-start.sh
```

**Windows:**
```bash
.\start-dev.bat
```

This automatically:
1. Builds frontend with Vite
2. Copies build to backend static resources
3. Builds Android APK (if Android SDK available)
4. Creates the H2 database file on first startup (at `./data/sgen` by default)
5. Starts Spring Boot server on `http://localhost:8084`

### Manual Setup

**Backend only:**
```bash
cd backend
mvn spring-boot:run
```

**Frontend only:**
```bash
cd frontend
npm install
npm run dev
```

The frontend dev server starts on `http://localhost:5173`

## Default Login

- **Username**: `admin`
- **Password**: `password`

> **Note**: You must change the password on first login.

## Build & Deploy

### Local Development

```bash
./rebuild-and-start.sh
```

This builds and starts the application locally on `http://localhost:8084`.

### Deploy to Production Server

```bash
./deploy-to-server.sh
```

**Before running:** Edit `deploy-to-server.sh` and configure:
- `SGEN_DDNS_OR_IP` - Your domain or IP address
- `SGEN_BRANCH` - Git branch to deploy (default: main)
- `SGEN_PROTOCOL` - http or https
- `SGEN_BACKEND_PORT` - Internal backend port (default: 8084)
- `SGEN_EXTERNAL_PORT` - External port clients connect to (may differ if behind reverse proxy)
- `SERVER_DIR` - Server directory path
- `GITHUB_REPO` - Your GitHub repository URL

**What it does:**
1. Stops the systemd service
2. Backs up the old JAR
3. Re-clones repository from GitHub
4. **Calls `sync-version.sh` to sync version to Android and frontend**
5. Builds with Android APK
6. Copies new JAR to server directory
7. Restarts the systemd service

### Systemd Service

The `sgen.service` file is provided for systemd-based Linux systems:

```bash
# Copy service file
sudo cp sgen.service /etc/systemd/system/

# Create override for environment variables
sudo mkdir -p /etc/systemd/system/sgen.service.d/
sudo tee /etc/systemd/system/sgen.service.d/override.conf > /dev/null <<EOF
[Service]
Environment="JWT_SECRET=your-secret-key"
Environment="CORS_ALLOWED_ORIGINS=https://your-domain.com"
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable sgen.service
sudo systemctl start sgen.service
```

## Configuration

### Admin Tasks

1. Login as admin and change password
2. Create users for your team
3. Monitor system health via **Monitoring** page (CPU, memory, disk usage)

### User Tasks

1. Login and change default password
2. Go to **Profile** and enter Intervals.icu credentials:
   - **Athlete ID**: Found in your Intervals.icu URL (e.g., `i443288`)
   - **API Key**: Generate in Intervals.icu → Settings → Developer Settings
3. Click **Test Connection** to verify your Intervals.icu account, then save
4. Go to **Statistics** to add your **Sports**, map activity types to each sport, and configure heart rate / power zones, LTHR, and max HR
5. Configure additional athlete profile settings (FTP, weight) in **Profile**
6. (Optional) Add **OpenAI** and **Strava** credentials in **Profile**:
   - **OpenAI**: Requires your own OpenAI account with API key. Enable, test the connection, and select your preferred AI model.
   - **Strava**: Enable Strava integration and connect your Strava account.
7. Navigate to **Statistics** to view your training data
8. Use **Search Workouts** to find and schedule pre-built workouts, or **Workout Creator** to build custom workouts
9. Track gear, achievements, and nutrition

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/change-password` - Change password

### Admin
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create new user
- `DELETE /api/admin/users/{id}` - Delete user
- `GET /api/admin/system/info` - Get system monitoring info (CPU, memory, disk)

### User
- `GET /api/user/me` - Get current user profile
- `PUT /api/user/profile` - Update user profile (Intervals.icu, OpenAI settings)
- `GET /api/user/intervals/test` - Test Intervals.icu connection
- `GET /api/user/openai/enabled` - Check if OpenAI is enabled for user
- `GET /api/user/openai/models` - Get available OpenAI models
- `GET /api/user/version` - Get app version info

### Athlete & Sports Configuration
- `GET /api/athlete/profile` - Get athlete profile (FTP, weight, zones)
- `PUT /api/athlete/profile` - Update athlete profile
- `GET /api/athlete/sports` - Get user's sports configuration
- `POST /api/athlete/sports` - Create/update sport
- `DELETE /api/athlete/sports/{id}` - Delete sport
- `GET /api/athlete/activity-mappings` - Get activity type mappings
- `POST /api/athlete/activity-mappings` - Map activity type to sport

### Statistics & Calendar
- `GET /api/statistics/fetch` - Fetch data from Intervals.icu
- `POST /api/statistics/analyze` - Analyze with OpenAI
- `GET /api/statistics/calendar/events` - Get calendar events
- `POST /api/statistics/calendar/events/batch` - Batch create/update events
- `DELETE /api/statistics/calendar/event/{id}` - Delete event
- `GET /api/weather/forecast` - Get weather forecast (SMHI)
- `GET /api/weather/location` - Get user's saved weather location
- `POST /api/weather/location` - Save weather location
- `GET /api/weather/search/{stationName}` - Search SMHI measurement stations
- `DELETE /api/weather/data` - Delete weather data
- `GET /api/statistics/achievements` - Get achievements

### Gear & Maintenance
- `GET /api/statistics/gear` - List all gear
- `POST /api/statistics/gear` - Create new gear item
- `PUT /api/statistics/gear/{id}` - Update gear
- `DELETE /api/statistics/gear/{id}` - Delete gear
- `GET /api/statistics/gear/{gearId}/maintenance` - Get maintenance records for gear
- `POST /api/statistics/gear/{gearId}/maintenance` - Add maintenance record
- `PUT /api/statistics/gear/{gearId}/maintenance/{id}` - Update maintenance record
- `DELETE /api/statistics/gear/{gearId}/maintenance/{id}` - Delete maintenance record

### Performance Analytics
- `GET /api/statistics/performance` - Get performance trends and metrics
- `GET /api/statistics/performance/power-curve` - Get power curve data
- `GET /api/statistics/performance/fitness` - Get fitness (CTL/ATL/TSB) data

### Workout Library
- `GET /api/workouts/library` - Search main workout library
- `GET /api/workouts/library/running` - Search running workout library
- `GET /api/workouts/custom` - Search custom workouts
- `GET /api/workouts/custom/all` - Get all custom workouts
- `POST /api/workouts/custom` - Save custom workout
- `DELETE /api/workouts/custom/{filename}` - Delete custom workout
- `GET /api/workouts/categories` - Get workout categories

### BikeFit
- `GET /api/bikefit/settings` - Get camera settings
- `POST /api/bikefit/settings` - Save camera settings
- `POST /api/bikefit/calculate-angle` - Calculate angle from 3 points
- `POST /api/bikefit/calculate-line-angle` - Calculate line angle from 2 points
- `POST /api/bikefit/generate-recommendations` - Generate recommendations from angles

### Downloads & Version
- `GET /api/version` - Get application version
- `GET /downloads/sgen-android.apk` - Download Android APK

## Android App

The application includes a Capacitor-based Android app that can be built alongside the web app.

### Building the Android App

The Android app is automatically built when running `./rebuild-and-start.sh` or `./deploy-to-server.sh` if Android SDK is available. The APK is served at `/downloads/sgen-android.apk`.

### APK Download

Once deployed, users can download the Android app directly:
```
http://your-server:8084/downloads/sgen-android.apk
```

### Version Management

Use `./sync-version.sh` to sync the version from `pom.xml` to all project files:
- Android `build.gradle` (versionCode and versionName)
- Frontend `package.json`

## Search Workouts & Workout Creator

### Search Workouts

Search and filter workouts from your custom-workout-library or the optional workout-library.

**Features:**
- **Filter by Category**: Endurance, Tempo, Sweet Spot, Threshold, VO2Max, Anaerobic, Sprint
- **Filter by TSS Range**: 0-40, 40-70, 70-100, 100-150, 150+
- **Filter by Duration**: 0-30min, 30-60min, 60-90min, 90+ min
- **Filter by Sport Type**: Cycling (Ride) or Running
- **Two Libraries**:
  - **Custom Workout Library**: Workouts you create using the Workout Creator
  - **Workout Library** (optional): Place your own ZWO files in `/backend/workout-library/` with categories: Endurance, Tempo, SweetSpot, Threshold, VO2Max, Anaerobic, Sprint
- **Sort Options**: By category, duration, or TSS
- **Visual Preview**: Power/pace chart for each workout
- **One-Click Schedule**: Schedule workouts directly to your calendar
- **Delete Custom Workouts**: Remove workouts you've created

### Workout Creator

Visual drag-and-drop workout builder with real-time metrics.

**Features:**
- **Drag-and-Drop Interface**: Build workouts by dragging interval types
- **Interval Types**:
  - Warm Up (ramp)
  - Steady State
  - Intervals (with reps and rest)
  - Recovery
  - Ramp
  - Cool Down
- **Real-Time Calculations**: TSS, IF, duration automatically calculated
- **Visual Power Chart**: See your workout structure as you build
- **Sport Type Support**: Create workouts for cycling or running
- **Category Assignment**: Organize workouts by training zone
- **Save & Schedule**: Save to custom library and optionally schedule immediately
- **Edit Steps**: Modify power, duration, reps for each interval
- **Reorder Steps**: Drag to reorder workout segments

**Workout Metrics:**
- **TSS (Training Stress Score)**: Automatically calculated based on power/pace and duration
- **IF (Intensity Factor)**: Average intensity relative to FTP
- **Total Duration**: Sum of all intervals including reps and rest
- **Power Zones**: Visual representation of training zones

## BikeFit Analysis

The BikeFit feature provides AI-powered video analysis using MediaPipe pose detection to automatically evaluate cycling position and biomechanics.

### How It Works

1. **Select Riding Style**: Choose between Road, Aero/TT, or MTB for optimized recommendations
2. **Video Upload/Recording**: Upload a video or record yourself cycling from the side
3. **AI Pose Detection**: MediaPipe automatically detects body landmarks (shoulder, elbow, wrist, hip, knee, ankle, heel, foot) in real-time
4. **Automatic Angle Calculation**: The system calculates key angles from detected landmarks:
   - **Knee @ BDC (Bottom Dead Center)** - max knee extension at bottom of pedal stroke (critical for saddle height)
   - **Knee @ TDC (Top Dead Center)** - max knee flexion at top of pedal stroke
   - **Hip Angle (closed @ top)** - closed torso-to-thigh angle at the top of the stroke
   - **Ankle Angle** - interior ankle angle (knee-ankle-toe)
   - **Back Angle** - torso angle measured from the horizontal (0° = flat/aero, 90° = upright)
   - **Elbow Angle** - interior elbow angle (180° = straight arm)
5. **AI Analysis**: OpenAI generates comprehensive recommendations based on measured angles and riding style
6. **Results**: View all analyzed frames with angles, status indicators (✅/⚠️), and personalized adjustment suggestions

### Analyzed Parameters

All measurements shown with target values and acceptable ranges for your selected riding style:

- **Knee @ BDC** - Max knee extension at bottom of pedal stroke (most critical for saddle height)
- **Knee @ TDC** - Max knee flexion at top of pedal stroke
- **Hip Angle (closed @ top)** - Closed torso-to-thigh angle at the top of the stroke
- **Ankle Angle** - Interior ankle angle (knee-ankle-toe)
- **Back Angle** - Torso angle from the horizontal (0° = flat/aero, 90° = upright)
- **Elbow Angle** - Interior elbow angle (180° = straight arm)

### Optimal Ranges by Riding Style

| Parameter       | Road     | Aero/TT  | MTB      |
|-----------------|----------|----------|----------|
| Knee @ BDC      | 140–150° | 140–150° | 138–148° |
| Knee @ TDC      | 65–78°   | 65–80°   | 68–82°   |
| Hip (closed @ top) | 55–75°   | 45–62°   | 62–82°   |
| Ankle Angle     | 95–115°  | 95–115°  | 95–115°  |
| Back Angle      | 40–55°   | 25–40°   | 45–60°   |
| Elbow Angle     | 150–168° | 95–115°  | 150–168° |

### Features

- **AI-Powered Pose Detection**: Uses MediaPipe to automatically detect body landmarks (shoulder, elbow, wrist, hip, knee, ankle, heel, foot)
- **Three riding styles**: Road, Aero/TT, and MTB with specific target ranges
- **Auto-reset**: All data cleared when navigating to BikeFit, starting video, or uploading new file
- **Frame-by-frame navigation**: Precise control over video playback with automatic pose detection
- **Real-time angle calculation**: Instant angle calculation from detected landmarks
- **AI Analysis**: OpenAI-powered recommendations based on your measurements and riding style
- **Comprehensive analysis**: All measurements shown with ✅/⚠️ status indicators vs optimal ranges
- **Smart recommendations**: Specific adjustment suggestions (e.g., "Raise saddle by ~13mm")
- **Session-based**: All data kept in memory during session, nothing saved to database
- **Progress tracking**: Visual indicators for completion status
- **Mobile support**: Camera recording with HTTPS requirement for mobile devices

## Contributing

SGEN is open for community contributions. New features, improvements, and translations are welcome.

The maintainer focuses mainly on the overall direction of the project and will **not actively fix reported bugs** — community pull requests for bug fixes are encouraged.

Please respect the creators of **Intervals.icu** and follow their API terms and guidelines when contributing.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for more details.

## License

MIT
