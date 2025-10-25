const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const crypto = require('crypto');

// Generate UUID v4 using built-in crypto
function generateUUID() {
  return crypto.randomUUID();
}

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// API Key validation middleware
const validateApiKey = (req, res, next) => {
  // Skip API key validation for health endpoint
  if (req.path === '/health') {
    return next();
  }

  const apiKey = req.headers['x-api-key'];

  // Accept Chari API keys for development
  const validChariKeys = [
    'aslan_internal_key_123',
    'chari_api_key_123',
    'chari_internal_key_456',
    'demo-chari-api-key'
  ];

  if (!apiKey || !validChariKeys.includes(apiKey)) {
    return res.status(401).json({
      errorCode: 401,
      errorDescription: 'Invalid or missing Chari API key'
    });
  }

  next();
};

// Apply API key validation to all routes
app.use(validateApiKey);

// Function to generate fake transactions for testing
function generateFakeTransactions(count = 25) {
  const transactionTypes = ['CASHIN', 'CASHOUT', 'TRANSFER_IN', 'TRANSFER_OUT', 'BILL_PAYMENT'];
  const descriptions = {
    'CASHIN': ['Mobile money deposit', 'Cash deposit at agent', 'Cash deposit at branch', 'ATM deposit', 'Bank transfer in'],
    'CASHOUT': ['ATM withdrawal', 'Cash withdrawal at agent', 'Cash withdrawal at branch', 'Point of sale'],
    'TRANSFER_IN': ['Transfer from +212611111111', 'Transfer from +212622222222', 'Transfer from +212633333333', 'Salary payment', 'Family transfer'],
    'TRANSFER_OUT': ['Transfer to +212644444444', 'Transfer to +212655555555', 'Payment to merchant', 'Bill payment', 'Friend transfer'],
    'BILL_PAYMENT': ['Electricity bill', 'Water bill', 'Internet bill', 'Mobile top-up', 'Insurance payment']
  };
  const statuses = ['COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED', 'PENDING']; // More completed than pending

  const transactions = [];
  let currentBalance = 5000.00; // Starting balance
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const type = transactionTypes[Math.floor(Math.random() * transactionTypes.length)];
    const isCredit = type === 'CASHIN' || type === 'TRANSFER_IN';
    const baseAmount = Math.random() * 1000 + 50; // Random amount between 50 and 1050
    const amount = isCredit ? baseAmount : -baseAmount;

    currentBalance += amount;

    // Generate date going backwards in time
    const daysAgo = count - i;
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    date.setHours(Math.floor(Math.random() * 24));
    date.setMinutes(Math.floor(Math.random() * 60));

    const descList = descriptions[type];
    const description = descList[Math.floor(Math.random() * descList.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];

    transactions.unshift({ // Add to beginning so newest are first
      id: `TXN_${String(i + 1).padStart(3, '0')}`,
      type: type,
      amount: parseFloat(amount.toFixed(2)),
      currency: 'MAD',
      date: date.toISOString(),
      description: description,
      status: status,
      balanceAfter: parseFloat(currentBalance.toFixed(2))
    });
  }

  return transactions;
}

// Mock database - in memory store for development
const mockData = {
  customers: {
    // Customer statuses: 0 = not exists, 1 = not confirmed, 2 = confirmed but no PIN, 3 = active, 4 = temporarily locked, 5 = permanently locked
    '+212600000001': { status: 0, message: 'Customer not found' },
    '+212600000002': { status: 1, message: 'Customer not confirmed' },
    '+212600000003': { status: 2, message: 'Customer confirmed but no PIN' },
    '+212600000004': { status: 3, message: 'Active customer' },
    '+212600000005': { status: 4, message: 'Temporarily locked' },
    '+212600000006': { status: 5, message: 'Permanently locked' },
    // Add more test numbers as needed
  },
  registrations: {
    '+212600000002': {
      firstName: 'Ahmed',
      lastName: 'Ben Ali',
      cin: 'AB123456',
      walletType: 'P',
      registeredAt: '2024-01-15T10:30:00Z'
    },
    '+212600000003': {
      firstName: 'Fatima',
      lastName: 'Zahra',
      cin: 'CD789012',
      walletType: 'P',
      registeredAt: '2024-01-20T14:15:00Z'
    },
    '+212600000004': {
      firstName: 'Mohammed',
      lastName: 'Alami',
      cin: 'EF345678',
      walletType: 'P',
      registeredAt: '2024-01-10T09:45:00Z'
    }
  },
  pins: {
    '+212600000004': '1234' // Stored for reference
  },
  balances: {
    '+212600000004': 3247.75,
    '+212600000003': 150.00,
    '+212600000002': 0.00
  },
  transactions: {
    '+212600000004': generateFakeTransactions(25),
    '+212600000003': generateFakeTransactions(25),
    '+212600000002': generateFakeTransactions(25)
  }
};

// Utility function to standardize API responses
const createResponse = (data, req = null) => {
  const requestId = req?.headers['c-request-id'] || generateUUID();
  return {
    data,
    c_request_id: requestId
  };
};

// Utility function to create error responses
const createErrorResponse = (errorCode, errorDescription) => ({
  errorCode,
  errorDescription
});

// Utility function to convert transaction type to operation type code
const getOperationType = (transactionType) => {
  const typeMap = {
    'CASHIN': 1,
    'CASHOUT': 2,
    'TRANSFER_IN': 3,
    'TRANSFER_OUT': 3,
    'BILL_PAYMENT': 4
  };
  return typeMap[transactionType] || 0;
};

// Utility function to convert transaction status to numeric code
const getTransactionStatus = (status) => {
  return status === 'COMPLETED' ? 2 : 1; // 1 = pending, 2 = completed
};

// Utility function to generate transaction reference
const generateTransactionReference = (tx, operationType) => {
  const date = new Date(tx.date);
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const txId = tx.id.replace('TXN_', '');

  // Format: T{opType}{opType}-{YYMMDD}{HH}-{txId}
  const opTypeStr = String(operationType).padStart(2, '0');
  return `T${opTypeStr}${opTypeStr}-${year}${month}${day}${hour}-${txId}`;
};

// Utility function to extract phone numbers from transaction description
const extractPhoneNumbers = (tx, customerPhone) => {
  let sender = null;
  let receiver = null;
  let beneficiary = null;

  if (tx.type === 'TRANSFER_OUT') {
    sender = customerPhone;
    // Try to extract receiver from description
    const phoneMatch = tx.description.match(/\+212\d{9}/);
    receiver = phoneMatch ? phoneMatch[0] : null;
    beneficiary = tx.description;
  } else if (tx.type === 'TRANSFER_IN') {
    receiver = customerPhone;
    // Try to extract sender from description
    const phoneMatch = tx.description.match(/\+212\d{9}/);
    sender = phoneMatch ? phoneMatch[0] : null;
    beneficiary = tx.description;
  } else if (tx.type === 'CASHIN') {
    receiver = customerPhone;
    sender = customerPhone;
  } else if (tx.type === 'CASHOUT') {
    sender = customerPhone;
    receiver = customerPhone;
  } else {
    // BILL_PAYMENT
    sender = customerPhone;
    receiver = null;
  }

  return { sender, receiver, beneficiary };
};

// Utility function to convert transaction to operation format
const transactionToOperation = (tx, phoneNumber, operationId = null) => {
  const opType = getOperationType(tx.type);
  const amount = Math.abs(tx.amount);
  const { sender, receiver, beneficiary } = extractPhoneNumbers(tx, phoneNumber);

  return {
    operationId: operationId,
    transactionId: parseInt(tx.id.replace('TXN_', '')),
    transactionReference: generateTransactionReference(tx, opType),
    amount: amount,
    reason: tx.description || null,
    operationType: opType,
    transactionDate: tx.date,
    sens: tx.amount > 0 ? 1 : 2, // 1 = credit, 2 = debit
    transactionStatus: getTransactionStatus(tx.status),
    feesAmount: 0,
    totalAmount: amount,
    transactionFeesId: null,
    sender: sender,
    receiver: receiver,
    beneficiary: beneficiary,
    // Legacy fields for backward compatibility
    accountNumber: phoneNumber,
    beneficiaryName: beneficiary || '',
    currency: tx.currency || 'MAD',
    balanceAfter: tx.balanceAfter
  };
};

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Chari API Stub'
  });
});

// Customer Status - GET /customers/status
app.get('/customers/status', (req, res) => {
  const { phoneNumber } = req.query;

  console.log(`[CHARI-STUB] Customer status check for: ${phoneNumber}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  // Check if customer exists in our mock data
  const customerStatus = mockData.customers[phoneNumber];

  if (!customerStatus || customerStatus.status === 0) {
    // Customer doesn't exist - return 204 No Content
    console.log(`[CHARI-STUB] Customer not found: ${phoneNumber}`);
    return res.status(204).send();
  }

  // Build complete customer information using the requested phone number
  const registration = mockData.registrations[phoneNumber];
  const balance = mockData.balances[phoneNumber] || 0;

  const customerInfo = {
    id: `customer-${phoneNumber.replace('+', '').replace(/\D/g, '')}`,
    phoneNumber: phoneNumber, // Use the requested phone number
    status: customerStatus.status, // Keep the numeric status as per Chari API spec
    walletType: registration?.walletType || 'P',
    balance: balance,
    currency: 'MAD',
    firstName: registration?.firstName,
    lastName: registration?.lastName,
    registeredAt: registration?.registeredAt
  };

  console.log(`[CHARI-STUB] Customer status: ${JSON.stringify(customerInfo)}`);
  res.json(createResponse(customerInfo, req));
});

// Customer Default Wallet - GET /customers/default
app.get('/customers/default', (req, res) => {
  const { phoneNumber } = req.query;

  console.log(`[CHARI-STUB] Default wallet check for: ${phoneNumber}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  // Check if customer exists in our mock data
  const customerStatus = mockData.customers[phoneNumber];

  if (!customerStatus || customerStatus.status === 0) {
    // Customer doesn't exist
    return res.status(404).json(createErrorResponse(404, 'Customer not found'));
  }

  // For stub, assume all existing customers have default wallet
  res.json(createResponse({ isDefaultWallet: true }, req));
});

// Customer Registration - POST /customers/register
app.post('/customers/register', (req, res) => {
  const { phoneNumber, firstName, lastName, cin, walletType } = req.body;

  console.log(`[CHARI-STUB] Registration request:`, req.body);

  if (!phoneNumber || !firstName || !lastName || !cin || !walletType) {
    return res.status(400).json(createErrorResponse(400, 'Missing required fields'));
  }

  // Store registration data
  mockData.registrations[phoneNumber] = {
    firstName,
    lastName,
    cin,
    walletType,
    registeredAt: new Date().toISOString()
  };

  // Update customer status to "not confirmed"
  mockData.customers[phoneNumber] = { status: 1, message: 'Customer not confirmed' };

  console.log(`[CHARI-STUB] Customer registered: ${phoneNumber}`);
  res.json(createResponse(true, req));
});

// Customer Registration Confirmation - POST /customers/confirm
app.post('/customers/confirm', (req, res) => {
  const { phoneNumber, code, walletType } = req.body;

  console.log(`[CHARI-STUB] Confirmation request for: ${phoneNumber}, code: ${code}`);

  if (!phoneNumber || !code || !walletType) {
    return res.status(400).json(createErrorResponse(400, 'Missing required fields'));
  }

  // For stub, accept "123456" as valid OTP (XXXXXX format)
  if (code !== '123456') {
    return res.status(400).json(createErrorResponse(400, 'Invalid confirmation code'));
  }

  // Update customer status to "confirmed but no PIN"
  mockData.customers[phoneNumber] = { status: 2, message: 'Customer confirmed but no PIN' };

  console.log(`[CHARI-STUB] Customer confirmed: ${phoneNumber}`);
  res.json(createResponse(true, req));
});

// Resend OTP - POST /customers/confirm/resend-otp
app.post('/customers/confirm/resend-otp', (req, res) => {
  const { phoneNumber } = req.query;

  console.log(`[CHARI-STUB] Resend OTP for: ${phoneNumber}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  // For stub, always return success
  console.log(`[CHARI-STUB] OTP resent to: ${phoneNumber}`);
  res.json(createResponse(true, req));
});

// Customer Login - POST /customers/login
app.post('/customers/login', (req, res) => {
  const { phoneNumber, pin } = req.body;

  console.log(`[CHARI-STUB] Login request for: ${phoneNumber}`);

  if (!phoneNumber || !pin) {
    return res.status(400).json(createErrorResponse(400, 'Phone number and PIN are required'));
  }

  // Check if customer exists and has a PIN
  const customerStatus = mockData.customers[phoneNumber];
  if (!customerStatus || customerStatus.status < 3) {
    return res.status(400).json(createErrorResponse(400, 'Customer not found or not activated'));
  }

  // For stub, accept only "1234" as valid PIN (XXXX format)
  const isCorrectPin = pin === '1234';

  const response = {
    logged: isCorrectPin,
    remainingAttempts: isCorrectPin ? 3 : 2
  };

  console.log(`[CHARI-STUB] Login result: ${JSON.stringify(response)}`);
  res.json(createResponse(response, req));
});

// Create PIN - POST /customers/pin
app.post('/customers/pin', (req, res) => {
  const { phoneNumber, pin } = req.body;

  console.log(`[CHARI-STUB] Create PIN for: ${phoneNumber}`);

  if (!phoneNumber || !pin) {
    return res.status(400).json(createErrorResponse(400, 'Phone number and PIN are required'));
  }

  // Store PIN and update customer status to active
  mockData.pins[phoneNumber] = pin;
  mockData.customers[phoneNumber] = { status: 3, message: 'Active customer' };

  console.log(`[CHARI-STUB] PIN created for: ${phoneNumber}`);
  res.json(createResponse(true, req));
});

// Update PIN - PUT /customers/pin
app.put('/customers/pin', (req, res) => {
  const { phoneNumber, oldPin, newPin } = req.body;

  console.log(`[CHARI-STUB] Update PIN for: ${phoneNumber}`);

  if (!phoneNumber || !oldPin || !newPin) {
    return res.status(400).json(createErrorResponse(400, 'Phone number, old PIN, and new PIN are required'));
  }

  // For stub, always accept the update
  mockData.pins[phoneNumber] = newPin;

  console.log(`[CHARI-STUB] PIN updated for: ${phoneNumber}`);
  res.json(createResponse(true, req));
});

// Customer Balance - GET /customers/balance
app.get('/customers/balance', (req, res) => {
  const { phoneNumber } = req.query;

  console.log(`[CHARI-STUB] Balance request for: ${phoneNumber}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  // Return mock balance
  const balance = mockData.balances[phoneNumber] || 1500.00; // Default balance

  console.log(`[CHARI-STUB] Balance for ${phoneNumber}: ${balance}`);
  res.json(createResponse({ balance }, req));
});

// Customer Info - GET /customers/info
app.get('/customers/info', (req, res) => {
  const { phoneNumber } = req.query;

  console.log(`[CHARI-STUB] Info request for: ${phoneNumber}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  const registration = mockData.registrations[phoneNumber];
  if (!registration) {
    return res.status(404).json(createErrorResponse(404, 'Customer not found'));
  }

  const customerInfo = {
    id: phoneNumber.replace('+', '').replace(/\D/g, ''), // Generate numeric ID from phone
    phoneNumber,
    firstName: registration.firstName,
    lastName: registration.lastName,
    cin: registration.cin,
    walletType: registration.walletType,
    status: mockData.customers[phoneNumber]?.status || 0,
    customer_status: mockData.customers[phoneNumber]?.status || 0,
    rib: `827640000010000000${phoneNumber.slice(-4)}`, // Generate fake RIB
    balance: mockData.balances[phoneNumber] || 0,
    createdAt: registration.registeredAt,
    updatedAt: new Date().toISOString()
  };

  console.log(`[CHARI-STUB] Customer info: ${JSON.stringify(customerInfo)}`);
  res.json(createResponse(customerInfo, req));
});

// Customer Transactions - GET /customers/transactions
app.get('/customers/transactions', (req, res) => {
  const { phoneNumber, limit = 10, offset = 0, page = 1 } = req.query;

  console.log(`[CHARI-STUB] Transactions request for: ${phoneNumber}, limit: ${limit}, offset: ${offset}, page: ${page}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  const transactions = mockData.transactions[phoneNumber] || [];
  const pageSize = parseInt(limit);
  const pageNumber = parseInt(page);

  // Support both offset-based and page-based pagination
  const startIndex = offset ? parseInt(offset) : (pageNumber - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedTransactions = transactions.slice(startIndex, endIndex);

  const totalPages = Math.ceil(transactions.length / pageSize);
  const currentPage = Math.floor(startIndex / pageSize) + 1;

  const response = {
    transactions: paginatedTransactions,
    total: transactions.length,
    limit: pageSize,
    offset: startIndex,
    page: currentPage,
    totalPages: totalPages,
    hasMore: endIndex < transactions.length,
    hasPrevious: startIndex > 0
  };

  console.log(`[CHARI-STUB] Returning ${paginatedTransactions.length} of ${transactions.length} transactions for ${phoneNumber} (page ${currentPage}/${totalPages})`);
  res.json(createResponse(response, req));
});

// Get Single Transaction - GET /customers/transactions/:transactionId
app.get('/customers/transactions/:transactionId', (req, res) => {
  const { phoneNumber } = req.query;
  const { transactionId } = req.params;

  console.log(`[CHARI-STUB] Get transaction ${transactionId} for: ${phoneNumber}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  const transactions = mockData.transactions[phoneNumber] || [];
  const transaction = transactions.find(tx => tx.id === `TXN_${String(transactionId).padStart(3, '0')}`);

  if (!transaction) {
    return res.status(404).json(createErrorResponse(404, 'Transaction not found'));
  }

  console.log(`[CHARI-STUB] Found transaction: ${transaction.id}`);
  res.json(createResponse(transaction, req));
});

// Customer Operations/Transfers - GET /operations (first version - simple)
app.get('/operations-simple', (req, res) => {
  const { phoneNumber, type, limit = 10, offset = 0, page = 1 } = req.query;

  console.log(`[CHARI-STUB] Operations request for: ${phoneNumber}, type: ${type}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  let transactions = mockData.transactions[phoneNumber] || [];

  // Filter by type if specified
  if (type) {
    transactions = transactions.filter(t => t.type === type);
  }

  const pageSize = parseInt(limit);
  const pageNumber = parseInt(page);

  // Support both offset-based and page-based pagination
  const startIndex = offset ? parseInt(offset) : (pageNumber - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedTransactions = transactions.slice(startIndex, endIndex);

  const totalPages = Math.ceil(transactions.length / pageSize);
  const currentPage = Math.floor(startIndex / pageSize) + 1;

  const response = {
    operations: paginatedTransactions,
    total: transactions.length,
    limit: pageSize,
    offset: startIndex,
    page: currentPage,
    totalPages: totalPages,
    hasMore: endIndex < transactions.length,
    hasPrevious: startIndex > 0
  };

  console.log(`[CHARI-STUB] Returning ${paginatedTransactions.length} of ${transactions.length} operations for ${phoneNumber} (page ${currentPage}/${totalPages})`);
  res.json(createResponse(response, req));
});

// Customer Unregister - DELETE /customers/unregister
app.delete('/customers/unregister', (req, res) => {
  const { phoneNumber } = req.query;

  console.log(`[CHARI-STUB] Unregister request for: ${phoneNumber}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  // Remove customer data
  delete mockData.customers[phoneNumber];
  delete mockData.registrations[phoneNumber];
  delete mockData.pins[phoneNumber];
  delete mockData.balances[phoneNumber];
  delete mockData.transactions[phoneNumber];

  console.log(`[CHARI-STUB] Customer unregistered: ${phoneNumber}`);
  res.json(createResponse(true, req));
});

// Operations endpoints

// CashIn Card Preview - POST /operations/cashin/card/preview
app.post('/operations/cashin/card/preview', (req, res) => {
  const { phoneNumber } = req.query;
  const { amount } = req.body;

  console.log(`[CHARI-STUB] CashIn preview for: ${phoneNumber}, amount: ${amount}`);

  if (!phoneNumber || !amount) {
    return res.status(400).json(createErrorResponse(400, 'Phone number and amount are required'));
  }

  // Mock preview response
  const previewResponse = {
    type: 1,
    operation: {
      phoneNumber,
      amount,
      method: 2,
      acceptedBy: 0,
      description: ''
    },
    feesAmount: 0,
    checkedAt: new Date().toISOString(),
    openLoop: false
  };

  res.json(createResponse(previewResponse, req));
});

// Transfer Preview - POST /operations/transfer/preview
app.post('/operations/transfer/preview', (req, res) => {
  const { customerPhoneNumber, amount, reason, recipientPhoneNumber } = req.body;

  console.log(`[CHARI-STUB] Transfer preview from: ${customerPhoneNumber}, to: ${recipientPhoneNumber}, amount: ${amount}`);

  if (!customerPhoneNumber || !amount || !recipientPhoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Missing required fields'));
  }

  // Mock transfer preview response
  const previewResponse = {
    type: 3,
    operation: {
      customerPhoneNumber,
      amount,
      reason: reason || '',
      beneficiaryId: null,
      recipientPhoneNumber
    },
    feesAmount: 0,
    totalAmount: amount,
    checkedAt: new Date().toISOString(),
    openLoop: false
  };

  res.json(createResponse(previewResponse, req));
});

// Transfer Execute - POST /operations/transfer
app.post('/operations/transfer', (req, res) => {
  const { customerPhoneNumber, amount, reason, recipientPhoneNumber } = req.body;

  console.log(`[CHARI-STUB] Transfer execution from: ${customerPhoneNumber}, to: ${recipientPhoneNumber}, amount: ${amount}`);

  if (!customerPhoneNumber || !amount || !recipientPhoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Missing required fields'));
  }

  // Check if sender exists and has sufficient balance
  const senderStatus = mockData.customers[customerPhoneNumber];
  if (!senderStatus || senderStatus.status < 3) {
    return res.status(400).json(createErrorResponse(400, 'Sender not found or not activated'));
  }

  const senderBalance = mockData.balances[customerPhoneNumber] || 0;
  if (senderBalance < amount) {
    return res.status(400).json(createErrorResponse(400, 'Insufficient balance'));
  }

  // Update balances
  mockData.balances[customerPhoneNumber] = senderBalance - amount;
  const recipientBalance = mockData.balances[recipientPhoneNumber] || 0;
  mockData.balances[recipientPhoneNumber] = recipientBalance + amount;

  // Mock transfer response
  const transferResponse = {
    operationType: 3,
    amount,
    feesAmount: 0,
    totalAmount: amount,
    reason: reason || '',
    recipientPhoneNumber,
    checkedAt: new Date().toISOString()
  };

  res.json(createResponse(transferResponse, req));
});

// Get Operations - GET /operations (main endpoint with full formatting)
app.get('/operations', (req, res) => {
  const { phoneNumber, operationType, transactionStatus, pageSize = 10, pageNumber = 1 } = req.query;

  console.log(`[CHARI-STUB] Get operations for: ${phoneNumber}, pageSize: ${pageSize}, pageNumber: ${pageNumber}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  // Get transactions for this customer
  let transactions = mockData.transactions[phoneNumber] || [];

  // Apply filters if provided
  if (operationType) {
    const opTypes = Array.isArray(operationType) ? operationType : [operationType];
    transactions = transactions.filter(t => opTypes.includes(t.type.toString()));
  }

  if (transactionStatus) {
    const statusStr = transactionStatus.toString().toUpperCase();
    transactions = transactions.filter(t => t.status.toString().toUpperCase() === statusStr);
  }

  const pageSizeInt = parseInt(pageSize);
  const pageNumberInt = parseInt(pageNumber);
  const totalRecords = transactions.length;
  const totalPages = Math.ceil(totalRecords / pageSizeInt);

  // Apply pagination
  const startIndex = (pageNumberInt - 1) * pageSizeInt;
  const endIndex = startIndex + pageSizeInt;
  const paginatedTransactions = transactions.slice(startIndex, endIndex);

  // Convert to expected format using helper function
  const operations = paginatedTransactions.map((tx, index) =>
    transactionToOperation(tx, phoneNumber, startIndex + index + 1)
  );

  const response = {
    collection: operations,
    count: operations.length,
    total: totalRecords,
    pageNumber: pageNumberInt,
    pageSize: pageSizeInt,
    totalPages: totalPages,
    hasMore: endIndex < totalRecords,
    hasPrevious: pageNumberInt > 1
  };

  console.log(`[CHARI-STUB] Returning ${operations.length} of ${totalRecords} operations for ${phoneNumber} (page ${pageNumberInt}/${totalPages})`);
  res.json(createResponse(response, req));
});

// Get Single Operation - GET /operations/:operationId
app.get('/operations/:operationId', (req, res) => {
  const { phoneNumber } = req.query;
  const { operationId } = req.params;

  console.log(`[CHARI-STUB] Get operation ${operationId} for: ${phoneNumber}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  const transactions = mockData.transactions[phoneNumber] || [];

  // operationId can map to transactionId or be sequential
  // Try to find by transaction ID first
  const opIdInt = parseInt(operationId);
  let transaction = transactions.find(tx => {
    const txId = parseInt(tx.id.replace('TXN_', ''));
    return txId === opIdInt;
  });

  // If not found by transaction ID, try by sequential index (1-based)
  if (!transaction && opIdInt > 0 && opIdInt <= transactions.length) {
    transaction = transactions[opIdInt - 1];
  }

  if (!transaction) {
    return res.status(404).json(createErrorResponse(404, 'Operation not found'));
  }

  // Convert to operation format
  const operation = transactionToOperation(transaction, phoneNumber, opIdInt);

  console.log(`[CHARI-STUB] Found operation: ${operation.transactionId}`);
  res.json(createResponse(operation, req));
});

// Beneficiary Management

// Get Beneficiaries - GET /customer/beneficiaries
app.get('/customer/beneficiaries', (req, res) => {
  const { phoneNumber, pageSize = 10, pageNumber = 1 } = req.query;

  console.log(`[CHARI-STUB] Get beneficiaries for: ${phoneNumber}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  // Mock beneficiaries data
  const mockBeneficiaries = [
    {
      id: 1,
      customerId: 1,
      name: 'Ahmed Benali',
      phoneNumber: '+212611111111',
      createdAt: '2025-01-15T10:30:00Z',
      isVisible: true,
      rib: null,
      email: 'ahmed@example.com'
    },
    {
      id: 2,
      customerId: 1,
      name: 'Fatima Zahra',
      phoneNumber: null,
      createdAt: '2025-01-20T14:15:00Z',
      isVisible: true,
      rib: '827640000010000000001234',
      email: null
    }
  ];

  const startIndex = (parseInt(pageNumber) - 1) * parseInt(pageSize);
  const endIndex = startIndex + parseInt(pageSize);
  const paginatedBeneficiaries = mockBeneficiaries.slice(startIndex, endIndex);

  const response = {
    collection: paginatedBeneficiaries,
    count: mockBeneficiaries.length
  };

  res.json(createResponse(response, req));
});

// Add Beneficiary - POST /customer/beneficiaries
app.post('/customer/beneficiaries', (req, res) => {
  const { phoneNumber } = req.query;
  const { name, phoneNumber: beneficiaryPhone, rib, email } = req.body;

  console.log(`[CHARI-STUB] Add beneficiary for: ${phoneNumber}`);

  if (!phoneNumber || !name) {
    return res.status(400).json(createErrorResponse(400, 'Phone number and name are required'));
  }

  if (!beneficiaryPhone && !rib) {
    return res.status(400).json(createErrorResponse(400, 'Either phone number or RIB must be provided'));
  }

  // Mock beneficiary creation
  const newBeneficiary = {
    id: Math.floor(Math.random() * 1000),
    customerId: 1,
    name,
    phoneNumber: beneficiaryPhone || null,
    createdAt: new Date().toISOString(),
    isVisible: true,
    rib: rib || null,
    email: email || null
  };

  res.json(createResponse(newBeneficiary, req));
});

// Update Beneficiary - PUT /customer/beneficiaries/{id}
app.put('/customer/beneficiaries/:id', (req, res) => {
  const { phoneNumber } = req.query;
  const { id } = req.params;
  const { name, phoneNumber: beneficiaryPhone, rib, email } = req.body;

  console.log(`[CHARI-STUB] Update beneficiary ${id} for: ${phoneNumber}`);

  if (!phoneNumber || !name) {
    return res.status(400).json(createErrorResponse(400, 'Phone number and name are required'));
  }

  // Mock beneficiary update
  const updatedBeneficiary = {
    BeneficiaryId: parseInt(id),
    userId: 1,
    name,
    phoneNumber: beneficiaryPhone || null,
    createdAt: '2025-01-15T10:30:00Z',
    isVisible: true,
    rib: rib || null,
    email: email || null
  };

  res.json(createResponse(updatedBeneficiary, req));
});

// Delete Beneficiary - DELETE /customer/beneficiaries/{id}
app.delete('/customer/beneficiaries/:id', (req, res) => {
  const { phoneNumber } = req.query;
  const { id } = req.params;

  console.log(`[CHARI-STUB] Delete beneficiary ${id} for: ${phoneNumber}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  // Mock beneficiary deletion
  res.json(createResponse(true, req));
});

// Request Operations

// Request CashIn - POST /operations/cashin/request
app.post('/operations/cashin/request', (req, res) => {
  const { PhoneNumber, amount } = req.body;

  console.log(`[CHARI-STUB] CashIn request for: ${PhoneNumber}, amount: ${amount}`);

  if (!PhoneNumber || !amount) {
    return res.status(400).json(createErrorResponse(400, 'Phone number and amount are required'));
  }

  // Mock cashin request
  const reference = `OR01-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}${String(new Date().getHours()).padStart(2, '0')}${String(Math.floor(Math.random() * 1000000)).padStart(6, '0')}`;

  const cashInRequest = {
    createdAt: new Date().toISOString(),
    closedAt: null,
    reference,
    phoneNumber: PhoneNumber,
    accountId: 1,
    operationType: 1,
    operationStatus: 1,
    partnerId: 1,
    amount,
    description: 'CashIn request'
  };

  res.json(createResponse(cashInRequest, req));
});

// Request CashOut - POST /operations/cashout/request
app.post('/operations/cashout/request', (req, res) => {
  const { PhoneNumber, amount } = req.body;

  console.log(`[CHARI-STUB] CashOut request for: ${PhoneNumber}, amount: ${amount}`);

  if (!PhoneNumber || !amount) {
    return res.status(400).json(createErrorResponse(400, 'Phone number and amount are required'));
  }

  // Mock cashout request
  const reference = `OR02-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}${String(new Date().getHours()).padStart(2, '0')}${String(Math.floor(Math.random() * 1000000)).padStart(6, '0')}`;

  const cashOutRequest = {
    createdAt: new Date().toISOString(),
    closedAt: null,
    reference,
    phoneNumber: PhoneNumber,
    accountId: 1,
    operationType: 2,
    operationStatus: 1,
    partnerId: 1,
    amount,
    description: 'CashOut request'
  };

  res.json(createResponse(cashOutRequest, req));
});

// Get CashIn By Reference - GET /operations/cashin/request
app.get('/operations/cashin/request', (req, res) => {
  const { reference } = req.query;

  console.log(`[CHARI-STUB] Get CashIn by reference: ${reference}`);

  if (!reference) {
    return res.status(400).json(createErrorResponse(400, 'Reference is required'));
  }

  // Mock cashin operation
  const operation = {
    reference,
    entity: null,
    createdAt: '2025-06-03T09:37:26.881973',
    executedAt: null,
    phoneNumber: '+212600000004',
    amount: 1000.0,
    description: null,
    partner: 'ChariMoney',
    status: 1,
    type: 1
  };

  res.json(createResponse(operation, req));
});

// Get CashOut By Reference - GET /operations/cashout/request
app.get('/operations/cashout/request', (req, res) => {
  const { reference } = req.query;

  console.log(`[CHARI-STUB] Get CashOut by reference: ${reference}`);

  if (!reference) {
    return res.status(400).json(createErrorResponse(400, 'Reference is required'));
  }

  // Mock cashout operation
  const operation = {
    reference,
    entity: null,
    createdAt: '2025-06-03T09:37:26.881973',
    executedAt: null,
    phoneNumber: '+212600000004',
    amount: 500.0,
    description: null,
    partner: 'ChariMoney',
    status: 1,
    type: 2
  };

  res.json(createResponse(operation, req));
});

// Catch-all for unimplemented endpoints
app.use((req, res) => {
  console.log(`[CHARI-STUB] Unimplemented endpoint: ${req.method} ${req.path}`);
  res.status(501).json(createErrorResponse(501, `Endpoint not implemented: ${req.method} ${req.path}`));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(`[CHARI-STUB] Error:`, err);
  res.status(500).json(createErrorResponse(500, 'Internal server error'));
});

// Start server
app.listen(PORT, () => {
  console.log(`[CHARI-STUB] Server running on port ${PORT}`);
  console.log(`[CHARI-STUB] Health check: http://localhost:${PORT}/health`);
  console.log(`[CHARI-STUB] Mock customers available:`);
  Object.entries(mockData.customers).forEach(([phone, status]) => {
    console.log(`  ${phone}: ${JSON.stringify(status)}`);
  });
});