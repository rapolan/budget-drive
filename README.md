# Driving School Management System

A comprehensive white-label driving school management platform with blockchain payment integration, multi-payment support, student tracking, and advanced features.

## Features

- **Multi-Payment Support**: Accept payments via Stripe, PayPal, Cash, and blockchain (BSV, MNEE)
- **Blockchain Integration**: Revolutionary cryptocurrency payments with near-zero fees
- **Student Management**: Track students, lessons, progress, and certifications
- **Instructor Management**: Schedule management, calendar integration, availability tracking
- **Google Calendar Sync**: Two-way sync with instructor calendars (+ iCal export)
- **Digital Certificates**: Issue completion certificates to students
- **Follow-Up Tracker**: Track and manage student follow-ups and conversions
- **White-Label Ready**: Fully customizable branding and features for multi-tenant deployment

## Architecture

### Tech Stack

**Frontend:**
- React + TypeScript
- Vite (build tool)
- TailwindCSS (styling)
- React Query (data fetching)
- Recharts (analytics)

**Backend:**
- Node.js + Express
- TypeScript
- PostgreSQL (primary database via Knex)
- MongoDB (optional - blockchain data)

**Blockchain:**
- Bitcoin SV (BSV) via Teranode
- MNEE Stablecoin (zero-gas payments)

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- MongoDB 6+ (optional)
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/rapolan/budget-drive.git
cd budget-drive
```

2. Install backend dependencies:
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration
```

3. Install frontend dependencies:
```bash
cd ../frontend
npm install
```

4. Set up the database:
```bash
cd ../backend
npm run migrate  # Run database migrations
node seed-budget-driving-tenant.js  # Seed initial data
```

### Running the Application

**Backend** (runs on port 3000):
```bash
cd backend
npm run dev
```

**Frontend** (runs on port 5173):
```bash
cd frontend
npm run dev
```

Access the application at: `http://localhost:5173`

## White-Label Tenant System

This system is built with a multi-tenant architecture allowing easy customization for different driving schools.

### Customization Points (50+)

- Business name, tagline, logo
- Brand colors (primary, secondary, accent)
- Contact information (email, phone, address)
- Feature toggles (blockchain, calendar, certificates, etc.)
- Localization (timezone, currency, language)
- Dashboard widgets and layout

### Configuration

Navigate to **Admin Dashboard → Settings** to customize:

1. **Business Information**: Name, tagline
2. **Branding & Theme**: Logo, colors
3. **Contact Details**: Email, phone, website, address
4. **Feature Toggles**: Enable/disable features per plan tier
5. **Localization**: Timezone, currency

See [TENANT_SYSTEM.md](./TENANT_SYSTEM.md) for complete documentation.

## Database Schema

### Core Tables

- `students` - Student profiles and contact information
- `instructors` - Instructor profiles and availability
- `appointments` - Lesson scheduling and tracking
- `payments` - Payment transactions (all methods)
- `blockchain_transactions` - BSV/MNEE transaction records
- `certificates` - Digital completion certificates
- `tenants` - White-label business entities
- `tenant_settings` - Customization configuration

## API Documentation

### Core Endpoints

**Students:**
- `GET /api/v1/students` - List all students (paginated)
- `POST /api/v1/students` - Create new student
- `PUT /api/v1/students/:id` - Update student
- `DELETE /api/v1/students/:id` - Delete student

**Instructors:**
- `GET /api/v1/instructors` - List all instructors (paginated)
- `POST /api/v1/instructors` - Create instructor
- `PUT /api/v1/instructors/:id` - Update instructor

**Appointments:**
- `GET /api/v1/appointments` - List appointments
- `POST /api/v1/appointments` - Create appointment
- `PUT /api/v1/appointments/:id` - Update appointment

**Payments:**
- `GET /api/v1/unified-payments/transactions` - List all transactions
- `POST /api/v1/unified-payments/process` - Process payment
- `GET /api/v1/unified-payments/methods` - Available payment methods

**Tenant Settings:**
- `GET /api/v1/tenant/settings` - Get current tenant configuration
- `PUT /api/v1/tenant/settings/:id` - Update tenant settings

## Blockchain Integration

### Supported Cryptocurrencies

**Bitcoin SV (BSV)**
- High-throughput blockchain via Teranode
- Low transaction fees
- Fast confirmation times

**MNEE Stablecoin**
- 1:1 USD pegged
- Zero gas fees
- Instant transactions
- Best value for customers

### Payment Flow

1. Student selects blockchain payment option
2. System generates payment address/request
3. Student sends payment from wallet
4. System monitors blockchain for confirmation
5. Payment marked as complete upon confirmation

## Deployment

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=driving_school
DB_USER=postgres
DB_PASSWORD=your_password

# JWT Secret
JWT_SECRET=your_secure_random_string

# Blockchain (optional)
BSV_NETWORK=testnet
TERANODE_RPC_URL=https://teranode-rpc.example.com
TERANODE_API_KEY=your_api_key
```

### Production Build

**Frontend:**
```bash
cd frontend
npm run build
# Deploy 'dist' folder to your hosting provider
```

**Backend:**
```bash
cd backend
npm run build
npm start
```

## Project Structure

```
driving-school-system/
├── backend/
│   ├── src/
│   │   ├── controllers/    # API route handlers
│   │   ├── services/       # Business logic
│   │   ├── routes/         # Express routes
│   │   ├── types/          # TypeScript interfaces
│   │   └── migrations/     # Database migrations
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── contexts/       # React context (TenantContext)
│   │   ├── api/            # API client
│   │   └── types/          # TypeScript interfaces
│   └── package.json
│
├── TENANT_SYSTEM.md        # White-label documentation
└── README.md
```

## Features by Plan Tier

| Feature | Basic | Pro | Enterprise |
|---------|-------|-----|------------|
| Student Management | ✅ | ✅ | ✅ |
| Appointment Scheduling | ✅ | ✅ | ✅ |
| Basic Payments | ✅ | ✅ | ✅ |
| Google Calendar Sync | ❌ | ✅ | ✅ |
| Multi-Payment Methods | ❌ | ✅ | ✅ |
| Follow-Up Tracker | ❌ | ✅ | ✅ |
| Digital Certificates | ❌ | ❌ | ✅ |
| **Blockchain Payments** | ❌ | ❌ | ✅ |
| White-label Branding | ❌ | ✅ | ✅ |
| Custom Domain | ❌ | ❌ | ✅ |

## Contributing

This is a private project for Budget Driving School. For feature requests or bug reports, please contact the development team.

## License

Proprietary - All rights reserved by Budget Driving School

## Support

For technical support or questions:
- Email: support@budgetdrivingschool.com
- Phone: (555) 123-4567

## Roadmap

**Completed:**
- ✅ Student/Instructor management
- ✅ Multi-payment integration
- ✅ Blockchain payments (BSV, MNEE)
- ✅ Google Calendar sync
- ✅ Digital certificates
- ✅ Follow-up tracker
- ✅ White-label tenant system

**In Progress:**
- 🔄 Logo upload functionality
- 🔄 Dynamic theming

**Planned:**
- 📋 Student portal
- 📋 Instructor portal
- 📋 SMS notifications
- 📋 Email templates
- 📋 Advanced analytics

## Credits

Built with ❤️ for Budget Driving School

**Technologies:**
- React, TypeScript, TailwindCSS
- Node.js, Express, PostgreSQL
- Bitcoin SV (Teranode)
