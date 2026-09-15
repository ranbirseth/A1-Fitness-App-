# 🏋️ A1 Fitness — Mobile App

> **A modern mobile gym management application built with React Native, Expo & TypeScript.**

A1 Fitness is a complete mobile companion for the **A1 Fitness Gym Management System**, designed to provide a fast, modern and scalable mobile experience for gym administrators and staff.

The application connects to the A1 Fitness backend and provides role-based access to gym management features such as members, memberships, plans, payments, attendance, trainers and more.

---

## ✨ Features

### 🔐 Authentication

* Secure Admin & Super Admin login
* Role-based authentication
* Token-based session management
* Persistent login session
* Automatic authentication state handling
* Protected application routes
* Logout functionality

### 👑 Super Admin

Super Admin has global control over the gym management system.

* Manage gyms
* Manage branches
* Manage branch administrators
* Manage gym-wide resources
* Create and manage membership plans
* Manage members
* Manage trainers
* Manage memberships
* Manage payments
* View business analytics
* Monitor branch activity
* Switch between branches
* Access administrative tools

### 🛡️ Admin

Branch Admin operates within their assigned branch.

* Dashboard
* Member management
* Add and manage members
* Assign membership plans
* Renew memberships
* Upgrade memberships
* Freeze memberships
* Resume memberships
* Cancel memberships
* Payment management
* Attendance management
* Trainer management
* Workout management
* Diet plan management
* Membership expiry tracking
* Notifications and reminders

### 👤 Member Management

* Create members
* View member profiles
* Update member information
* Membership status
* Membership expiry information
* Payment status
* Assigned plan
* Attendance information
* Membership history

### 💳 Membership & Payments

* Membership plan assignment
* Payment tracking
* Payment status
* Pending payment handling
* Membership renewal
* Plan upgrades
* Membership freeze/resume
* Payment history
* Invoice information

### 📅 Attendance

* Attendance tracking
* Attendance logs
* Date-based attendance filtering
* Member attendance information
* Branch-specific attendance data

### 🏋️ Trainers

* Trainer management
* Trainer information
* Trainer assignment
* Branch-specific trainer data

### 🥗 Workout & Diet

* Workout templates
* Diet templates
* Branch-aware resources
* Template management
* Reusable fitness programs

### 🔔 Notifications & Reminders

* Membership expiry notifications
* Payment reminders
* In-app notifications
* Expiry tracking
* Reminder management

> WhatsApp notification support can be integrated through a WhatsApp Business API provider in the future.

---

# 🧱 Tech Stack

## Mobile

| Technology       | Purpose                           |
| ---------------- | --------------------------------- |
| React Native     | Mobile application framework      |
| Expo             | React Native development platform |
| TypeScript       | Type-safe development             |
| React Navigation | Navigation                        |
| Zustand          | State management                  |
| Axios / Fetch    | API communication                 |
| AsyncStorage     | Local persistence                 |
| Expo Modules     | Native functionality              |

## Backend

The mobile application communicates with the A1 Fitness backend.

* Node.js
* Express.js
* MongoDB
* Mongoose
* REST APIs
* JWT Authentication
* Role-based authorization

---

# 🏗️ Application Architecture

```text
                 ┌───────────────────────┐
                 │      A1 Fitness       │
                 │     React Native      │
                 │        Mobile         │
                 └───────────┬───────────┘
                             │
                             │ REST API
                             ▼
                 ┌───────────────────────┐
                 │    A1 Fitness API     │
                 │     Node.js/Express   │
                 └───────────┬───────────┘
                             │
                             │
                             ▼
                 ┌───────────────────────┐
                 │       MongoDB         │
                 │       Database        │
                 └───────────────────────┘
```

---

# 👥 Role-Based Architecture

A1 Fitness follows a hierarchical access-control model.

```text
Super Admin
    │
    ├── Gym
    │    │
    │    ├── Branch
    │    │     │
    │    │     └── Admin
    │    │
    │    └── Global Resources
    │
    └── Multiple Branches
```

### Super Admin

Has global access and can manage branches and branch administrators.

### Admin

Works inside a specific assigned branch and manages branch-level resources.

---

# 📱 Application Structure

A typical project structure:

```text
a1-fitness-mobile/
│
├── assets/
│   ├── images/
│   ├── icons/
│   └── fonts/
│
├── src/
│   │
│   ├── components/
│   │   ├── common/
│   │   ├── cards/
│   │   ├── forms/
│   │   └── navigation/
│   │
│   ├── screens/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── members/
│   │   ├── plans/
│   │   ├── payments/
│   │   ├── attendance/
│   │   ├── trainers/
│   │   ├── workouts/
│   │   ├── diet/
│   │   └── notifications/
│   │
│   ├── navigation/
│   │
│   ├── services/
│   │   ├── api/
│   │   ├── auth/
│   │   └── storage/
│   │
│   ├── store/
│   │
│   ├── hooks/
│   │
│   ├── utils/
│   │
│   ├── constants/
│   │
│   ├── types/
│   │
│   └── theme/
│
├── app.json
├── package.json
├── tsconfig.json
└── README.md
```

> The exact structure may differ depending on the current implementation.

---

# 🚀 Getting Started

## Prerequisites

Make sure the following are installed:

* Node.js
* npm or yarn
* Expo CLI / Expo development tools
* Android Studio for Android development
* Android Emulator or physical Android device
* Git

Check Node.js:

```bash
node --version
```

Check npm:

```bash
npm --version
```

---

# 📥 Installation

Clone the repository:

```bash
git clone <YOUR_REPOSITORY_URL>
```

Move into the project:

```bash
cd a1-fitness-mobile
```

Install dependencies:

```bash
npm install
```

---

# ⚙️ Environment Configuration

Create an environment configuration file according to the project's environment setup.

Example:

```env
API_BASE_URL=http://YOUR_SERVER_IP:5000/api
```

### ⚠️ Android Development

When using a physical Android device or Android emulator, avoid using:

```text
localhost
```

for the backend API unless the networking setup specifically supports it.

For a physical device, use the computer's local network IP:

```env
API_BASE_URL=http://192.168.x.x:5000/api
```

Make sure:

* Phone and computer are on the same network
* Backend server is running
* Backend port is accessible
* Firewall allows the connection

---

# ▶️ Running the Application

Start the Expo development server:

```bash
npx expo start
```

### Android

```bash
npx expo start --android
```

### iOS

```bash
npx expo start --ios
```

### Web

```bash
npx expo start --web
```

---

# 🔑 Authentication Flow

The authentication flow is designed around the backend's role-based authorization system.

```text
Launch App
    │
    ▼
Check Stored Token
    │
    ├── Token exists
    │       │
    │       ▼
    │   Validate Session
    │       │
    │       ▼
    │   Load User Role
    │       │
    │       ├── Super Admin
    │       │
    │       └── Admin
    │
    └── No Token
            │
            ▼
        Login Screen
```

After successful authentication:

```text
Login
  ↓
API Authentication
  ↓
Receive Token
  ↓
Store Session
  ↓
Load User Profile
  ↓
Determine Role
  ↓
Open Appropriate Dashboard
```

---

# 🔒 Security

A1 Fitness follows role-based security principles.

### Access Control

```text
Super Admin
    ↓
Global Access

Admin
    ↓
Assigned Branch Access
```

The mobile application should never rely only on UI restrictions for authorization.

The backend remains the final authority for:

* User permissions
* Branch access
* Resource ownership
* Membership operations
* Payment operations
* Administrative actions

---

# 🏢 Branch Isolation

A1 Fitness supports multiple branches.

Branch-level resources should remain isolated.

```text
Gym
│
├── MAIN
│   ├── Members
│   ├── Trainers
│   ├── Plans
│   ├── Payments
│   └── Attendance
│
├── BRANCH-02
│   ├── Members
│   ├── Trainers
│   ├── Plans
│   ├── Payments
│   └── Attendance
│
└── BRANCH-03
    ├── Members
    ├── Trainers
    ├── Plans
    ├── Payments
    └── Attendance
```

Super Admin can work across branches where permitted.

Admins remain restricted to their assigned branch.

---

# 💰 Membership Lifecycle

A membership can follow a lifecycle such as:

```text
Member Created
      ↓
Plan Assigned
      ↓
Payment Created
      ↓
Membership Active
      ↓
Near Expiry
      ↓
Expired
      ↓
Renew / Upgrade
```

Additional membership actions include:

```text
Active
  ├── Renew
  ├── Upgrade
  ├── Freeze
  └── Cancel

Frozen
  └── Resume
```

---

# 🧪 Testing

The application should be tested separately for each role.

## Super Admin Testing

Verify:

* Login
* Dashboard
* Branch management
* Admin management
* Member management
* Plan management
* Trainer management
* Payment management
* Attendance
* Workout templates
* Diet templates
* Notifications
* Branch switching
* Logout

## Admin Testing

Verify:

* Login
* Dashboard
* Member creation
* Member editing
* Plan assignment
* Payment flow
* Membership renewal
* Membership upgrade
* Freeze/resume
* Attendance
* Trainers
* Workouts
* Diet plans
* Notifications
* Branch restrictions
* Logout

---

# 🐛 Bug Reporting

When reporting a bug, include:

```text
1. User Role
2. Screen
3. Action performed
4. Expected result
5. Actual result
6. API response
7. Device / OS
8. Steps to reproduce
```

Example:

```text
Role:
Admin

Screen:
Members

Action:
Assign membership plan

Expected:
Plan should be assigned and payment should be created.

Actual:
Payment already exists error appears.

Device:
Android

Steps:
1. Login as Admin
2. Open Members
3. Select member
4. Select plan
5. Tap Assign Plan
```

---

# 📦 Production Build

For production Android builds, use the project's configured Expo/EAS build workflow.

Typical command:

```bash
eas build --platform android
```

For an APK testing build, configure the appropriate EAS build profile.

For production deployment:

```text
React Native / Expo
        ↓
Production Configuration
        ↓
EAS Build
        ↓
Android APK / AAB
        ↓
Testing
        ↓
Google Play Store
```

---

# 🌐 Backend Requirements

The mobile application requires the A1 Fitness backend to be running.

Backend architecture:

```text
server/
│
├── Express.js
├── MongoDB
├── Authentication
├── Users
├── Members
├── Plans
├── Memberships
├── Payments
├── Attendance
├── Trainers
├── Workouts
├── Diet Plans
├── Notifications
└── Branch Management
```

The backend must be configured with the required database and environment variables before the mobile application can operate correctly.

---

# 📊 Development Workflow

Recommended development workflow:

```text
Feature Request
      ↓
Understand Existing Backend API
      ↓
Implement Mobile UI
      ↓
Connect API
      ↓
Implement State Management
      ↓
Test Role Permissions
      ↓
Test Real API
      ↓
Test Android Device
      ↓
Fix Bugs
      ↓
Production Build
```

---

# 🎯 Project Goals

A1 Fitness Mobile aims to provide:

* ⚡ Fast mobile experience
* 🎨 Modern and clean UI
* 🔐 Secure authentication
* 👥 Strong role-based access
* 🏢 Multi-branch support
* 💳 Reliable membership/payment workflows
* 📊 Useful gym management insights
* 📱 Android-first mobile experience
* 🔄 Seamless integration with the A1 Fitness backend
* 🚀 Scalable architecture for future features

---

# 🗺️ Future Improvements

Potential future enhancements include:

* [ ] Member mobile login
* [ ] Trainer mobile login
* [ ] Push notifications
* [ ] WhatsApp reminders
* [ ] Online payment integration
* [ ] Digital invoices
* [ ] QR-based attendance
* [ ] Member workout tracking
* [ ] Member diet tracking
* [ ] Advanced analytics
* [ ] Offline support
* [ ] Dark/light theme
* [ ] Multi-language support
* [ ] Biometric authentication
* [ ] Automated membership reminders

---

# 🤝 Contributing

Contributions should follow the project's development standards.

Before submitting changes:

1. Understand the existing architecture.
2. Avoid breaking existing backend contracts.
3. Follow TypeScript conventions.
4. Test both Admin and Super Admin workflows.
5. Verify branch isolation.
6. Test API error handling.
7. Test on an Android device/emulator.
8. Keep changes focused and maintainable.

---

# 📄 License

This project is currently maintained as a private A1 Fitness application.

All rights reserved.

---

# 💪 A1 Fitness

**Manage your gym. Manage your members. Manage your growth.**

> Built with ❤️ using React Native, Expo & TypeScript.
