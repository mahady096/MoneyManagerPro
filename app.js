// ==========================
// GLOBAL VARIABLES
// ==========================
let selectedSet = new Set();
let chartSelectedSet = new Set(); 

let accountsData = [];
let allTransactions = [];

let currentTransType = '';
let currentEditingTransId = '';
let currentEditingAccId = '';

let myChart = null;

// ==========================
// AUTH STATE
// ==========================
auth.onAuthStateChanged(user => {
  if (user) {
    document.getElementById('authBox').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    loadData();
  } else {
    document.getElementById('authBox').style.display = 'block';
    document.getElementById('app').style.display = 'none';
  }
});

// ==========================
// AUTH FUNCTIONS
// ==========================
async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  if (!email || !password) return alert("ইমেইল ও পাসওয়ার্ড দিন");
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (e) {
    alert(e.message);
  }
}

async function register() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  if (!email || !password) return alert("ইমেইল ও পাসওয়ার্ড দিন");
  try {
    await auth.createUserWithEmailAndPassword(email, password);
    alert("রেজিস্ট্রেশন সফল");
  } catch (e) {
    alert(e.message);
  }
}

function logout() {
  auth.signOut();
}

// ==========================
// LOAD MAIN DATA
// ==========================
async function loadData() {
  await loadAccounts();
  await loadTransactions();
  await loadRecurringList();
}

// ==========================
// ACCOUNTS (DASHBOARD)
// ==========================
async function loadAccounts() {
  const user = auth.currentUser;
  if (!user) return;

  const snapshot = await db
    .collection('users')
    .doc(user.uid)
    .collection('accounts')
    .orderBy('createdAt', 'asc')
    .get();

  accountsData = [];
  let html = '';
  let total = 0;

  snapshot.forEach(doc => {
    const data = doc.data();
    accountsData.push({ id: doc.id, ...data });

    if (data.name !== "OUT OF WALLET") {
      total += Number(data.balance);
      const selected = selectedSet.has(doc.id) ? 'selected' : '';

      html += `
      <div class="account-item ${selected}" id="acc-${doc.id}">
        <div class="account-actions no-print">
          <button onclick="openEditAccModal('${doc.id}')" style="background:#6b7280;" title="Rename">✏️</button>
          <button onclick="deleteAccount('${doc.id}')" style="background:#dc2626;" title="Delete">🗑️</button>
        </div>
        <div onclick="toggleSelect('${doc.id}')" class="account-info-box">
          <strong>${data.name}</strong>
          <span>${Number(data.balance).toLocaleString()}</span>
        </div>
      </div>
      `;
    }
  });

  document.getElementById('accountsList').innerHTML = html;
  document.getElementById('totalBalance').innerText = total.toLocaleString() + " BDT";
  updateSelectedSum();
}

function toggleSelect(id) {
  if (selectedSet.has(id)) {
    selectedSet.delete(id);
  } else {
    selectedSet.add(id);
  }
  loadAccounts();
  loadTransactions();
}

function updateSelectedSum() {
  let sum = 0;
  accountsData.forEach(acc => {
    if (selectedSet.has(acc.id)) {
      sum += Number(acc.balance);
    }
  });

  if (selectedSet.size > 0) {
    document.getElementById('selectedBalanceBox').style.display = 'block';
  } else {
    document.getElementById('selectedBalanceBox').style.display = 'none';
  }
  document.getElementById('selectedBalance').innerText = sum.toLocaleString();
}

// ==========================
// SAVE ACCOUNT (UPDATED)
// ==========================
async function saveNewAccount() {
  const name = document.getElementById('newAccName').value.trim();
  const accNo = document.getElementById('newAccNumber').value.trim() || 'N/A';
  const accType = document.getElementById('newAccType').value;
  const balance = Number(document.getElementById('newAccBalance').value);
  const user = auth.currentUser;

  if (!name || isNaN(balance)) return alert("সঠিক তথ্য দিন");

  try {
    await db.collection('users').doc(user.uid).collection('accounts').add({
      name: name,
      accountNumber: accNo,
      accountType: accType,
      balance: balance,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert("অ্যাকাউন্ট তৈরি হয়েছে");
    closeModal('addAccModal');
    document.getElementById('newAccName').value = '';
    document.getElementById('newAccNumber').value = '';
    document.getElementById('newAccBalance').value = '';
    loadData();
  } catch (e) {
    alert(e.message);
  }
}

// ==========================
// RENAME & DELETE ACCOUNT FUNCTIONS
// ==========================
function openEditAccModal(id) {
  const acc = accountsData.find(a => a.id === id);
  if (!acc) return;
  
  currentEditingAccId = id;
  document.getElementById('editAccCurrentName').innerText = `Current Name: ${acc.name}`;
  document.getElementById('editAccNewName').value = acc.name;
  document.getElementById('editAccModal').style.display = 'flex';
}

async function updateAccountName() {
  const user = auth.currentUser;
  const newName = document.getElementById('editAccNewName').value.trim();
  
  if (!newName) return alert("অনুগ্রহ করে একটি সঠিক নাম দিন");
  
  const oldAcc = accountsData.find(a => a.id === currentEditingAccId);
  if (!oldAcc) return;

  try {
    await db.runTransaction(async (transaction) => {
      const accRef = db.collection('users').doc(user.uid).collection('accounts').doc(currentEditingAccId);
      transaction.update(accRef, { name: newName });

      const transSnap = await db.collection('users').doc(user.uid).collection('transactions').where('accName', '==', oldAcc.name).get();
      transSnap.docs.forEach(transDoc => {
        transaction.update(transDoc.ref, { accName: newName });
      });
    });

    alert("অ্যাকাউন্টের নাম সফলভাবে পরিবর্তন করা হয়েছে");
    closeModal('editAccModal');
    loadData();
  } catch (e) {
    alert("রিনেম করতে সমস্যা হয়েছে: " + e.message);
  }
}

async function deleteAccount(id) {
  const user = auth.currentUser;
  const acc = accountsData.find(a => a.id === id);
  if (!acc) return;

  if (Number(acc.balance) !== 0) {
    const proceed = confirm(`সতর্কবার্তা: এই অ্যাকাউন্টে এখনো BDT ${acc.balance} ব্যালেন্স রয়েছে! অ্যাকাউন্টটি ডিলিট করলে এই ব্যালেন্স হিসাব থেকে হারিয়ে যাবে। আপনি কি তবুও ডিলিট করতে চান?`);
    if (!proceed) return;
  } else {
    const doubleCheck = confirm(`আপনি কি নিশ্চিতভাবে "${acc.name}" অ্যাকাউন্টটি ডিলিট করতে চান?`);
    if (!doubleCheck) return;
  }

  try {
    await db.collection('users').doc(user.uid).collection('accounts').doc(id).delete();
    
    const transSnap = await db.collection('users').doc(user.uid).collection('transactions').where('accName', '==', acc.name).get();
    const batch = db.batch();
    transSnap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    alert("অ্যাকাউন্টটি সফলভাবে ডিলিট করা হয়েছে");
    selectedSet.delete(id);
    loadData();
  } catch (e) {
    alert("ডিলিট করতে সমস্যা হয়েছে: " + e.message);
  }
}

// ==========================
// TRANSACTIONS
// ==========================
async function loadTransactions() {
  const user = auth.currentUser;
  if (!user) return;

  const snapshot = await db
    .collection('users')
    .doc(user.uid)
    .collection('transactions')
    .orderBy('createdAt', 'desc')
    .get();

  allTransactions = [];
  snapshot.forEach(doc => {
    allTransactions.push({ id: doc.id, ...doc.data() });
  });

  let filtered = allTransactions;
  if (selectedSet.size > 0) {
    const names = accountsData.filter(a => selectedSet.has(a.id)).map(a => a.name);
    filtered = allTransactions.filter(t => names.includes(t.accName));
  }

  let html = '';
  filtered.slice(0, 10).forEach(item => {
    let color = '#2563eb';
    if (item.type === 'income') color = '#16a34a';
    if (item.type === 'expense') color = '#dc2626';

    const label = item.type === 'income' ? 'জমা' : item.type === 'expense' ? 'খরচ' : 'স্থানান্তর';
    const date = item.createdAt ? item.createdAt.toDate().toLocaleDateString('en-GB') : 'Pending';

    html += `
    <div class="card" style="border-left:5px solid ${color}; margin-bottom: 8px; padding: 10px;">
      <strong>${label}</strong> - ${item.accName || 'Unknown'}<br>
      ${Number(item.amount).toLocaleString()} BDT
      <br>
      <small>${date} | ${item.note || ''}</small>
      <br>
      <button onclick="openEditTransModal('${item.id}')" style="margin-top:5px;background:#6b7280;color:white;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;">Edit</button>
    </div>
    `;
  });

  document.getElementById('transactionsList').innerHTML = html || "কোন ট্রানজেকশন নেই";
  calculateIncomeExpense();
}

function calculateIncomeExpense() {
  let income = 0; let expense = 0;
  const names = accountsData.filter(a => selectedSet.size === 0 || selectedSet.has(a.id)).map(a => a.name);

  allTransactions.forEach(t => {
    if (names.includes(t.accName)) {
      if (t.type === 'income') income += Number(t.amount);
      if (t.type === 'expense') expense += Number(t.amount);
    }
  });

  document.getElementById('totalIncomeDisplay').innerText = income.toLocaleString();
  document.getElementById('totalExpenseDisplay').innerText = expense.toLocaleString();
}

// ==========================
// TRANSACTIONS PROCESS
// ==========================
function openModal(type) {
  if (selectedSet.size !== 1) return alert("একটি অ্যাকাউন্ট সিলেক্ট করুন");
  currentTransType = type;
  document.getElementById('modalTitle').innerText = type === 'income' ? 'টাকা জমা' : 'পেমেন্ট';
  document.getElementById('transModal').style.display = 'flex';
}

async function processTransaction() {
  const amount = Number(document.getElementById('transAmount').value);
  const note = document.getElementById('transNote').value;

  if (!amount || amount <= 0) return alert("সঠিক amount দিন");
  const user = auth.currentUser;
  const accId = Array.from(selectedSet)[0];

  try {
    const ref = db.collection('users').doc(user.uid).collection('accounts').doc(accId);
    const doc = await ref.get();
    const data = doc.data();

    let newBalance = currentTransType === 'income' ? Number(data.balance) + amount : Number(data.balance) - amount;

    await ref.update({ balance: newBalance });
    await db.collection('users').doc(user.uid).collection('transactions').add({
      accName: data.name,
      type: currentTransType,
      amount,
      note,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert("সফল হয়েছে");
    closeModal('transModal');
    document.getElementById('transAmount').value = '';
    document.getElementById('transNote').value = '';
    loadData();
  } catch (e) {
    alert(e.message);
  }
}

// ==========================
// TRANSFER LOGIC
// ==========================
function openTransferModal() {
  const fromSelect = document.getElementById('transferFromAcc');
  const toSelect = document.getElementById('transferToAcc');
  
  fromSelect.innerHTML = '';
  toSelect.innerHTML = '';

  accountsData.forEach(acc => {
    const opt1 = document.createElement('option');
    opt1.value = acc.id; 
    opt1.text = acc.name;
    fromSelect.add(opt1);

    const opt2 = document.createElement('option');
    opt2.value = acc.id; 
    opt2.text = acc.name;
    toSelect.add(opt2);
  });

  document.getElementById('transferModal').style.display = 'flex';
}

async function processTransfer() {
  const amount = Number(document.getElementById('transferAmount').value);
  const note = document.getElementById('transferNote').value;
  
  const fromId = document.getElementById('transferFromAcc').value;
  const toId = document.getElementById('transferToAcc').value;

  if (!amount || amount <= 0) return alert("অনুগ্রহ করে সঠিক amount দিন");
  if (fromId === toId) return alert("Source এবং Destination অ্যাকাউন্ট একই হতে পারবে না!");
  
  const user = auth.currentUser;

  try {
    const fromRef = db.collection('users').doc(user.uid).collection('accounts').doc(fromId);
    const toRef = db.collection('users').doc(user.uid).collection('accounts').doc(toId);

    await db.runTransaction(async t => {
      const fromDoc = await t.get(fromRef);
      const toDoc = await t.get(toRef);

      if (Number(fromDoc.data().balance) < amount) {
        throw new Error("দুঃখিত! উৎস অ্যাকাউন্টে পর্যাপ্ত ব্যালেন্স নেই।");
      }

      t.update(fromRef, { balance: Number(fromDoc.data().balance) - amount });
      t.update(toRef, { balance: Number(toDoc.data().balance) + amount });

      const transRef = db.collection('users').doc(user.uid).collection('transactions');
      t.set(transRef.doc(), {
        accName: fromDoc.data().name,
        type: 'transfer_out', 
        amount,
        note: `To ${toDoc.data().name} - ${note}`,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      t.set(transRef.doc(), {
        accName: toDoc.data().name,
        type: 'transfer_in',
        amount,
        note: `From ${fromDoc.data().name} - ${note}`,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    alert("স্থানান্তর সফল হয়েছে");
    closeModal('transferModal');
    
    document.getElementById('transferAmount').value = '';
    document.getElementById('transferNote').value = '';
    loadData();
  } catch (e) {
    alert(e.message);
  }
}

// ==========================
// EDIT TRANSACTION
// ==========================
function openEditTransModal(id) {
  const trans = allTransactions.find(t => t.id === id);
  if (!trans) return;

  if (trans.type.startsWith('transfer')) {
    return alert("Transfer transactions cannot be edited directly. Please delete and recreate if needed.");
  }

  currentEditingTransId = id;
  document.getElementById('editTransTarget').innerText = trans.accName;
  document.getElementById('editTransAmount').value = trans.amount;
  document.getElementById('editTransNote').value = trans.note || '';
  document.getElementById('editTransModal').style.display = 'flex';
}

async function updateTransaction() {
  const user = auth.currentUser;
  const trans = allTransactions.find(t => t.id === currentEditingTransId);
  if (!trans) return;

  const newAmount = Number(document.getElementById('editTransAmount').value);
  const newNote = document.getElementById('editTransNote').value;
  if (isNaN(newAmount) || newAmount <= 0) return alert("সঠিক পরিমাণ দিন");
  
  const diff = newAmount - Number(trans.amount);

  try {
    await db.runTransaction(async (transaction) => {
      const query = await db.collection('users').doc(user.uid).collection('accounts').where('name', '==', trans.accName).get();
      if (query.empty) throw new Error("Account not found");
      
      const accDoc = query.docs[0];
      const accRef = accDoc.ref;
      let finalBalance = trans.type === 'income' ? Number(accDoc.data().balance) + diff : Number(accDoc.data().balance) - diff;

      transaction.update(accRef, { balance: finalBalance });
      transaction.update(db.collection('users').doc(user.uid).collection('transactions').doc(currentEditingTransId), {
        amount: newAmount, note: newNote
      });
    });

    alert("Updated");
    closeModal('editTransModal');
    loadData();
  } catch (e) {
    alert(e.message);
  }
}

// ==========================
// CHART LOGIC
// ==========================
function loadChartAccounts() {
  let html = '';
  accountsData.forEach(acc => {
    if (acc.name !== "OUT OF WALLET") {
      const selected = chartSelectedSet.has(acc.id) ? 'selected' : '';
      html += `
      <div class="account-item ${selected}" id="chart-acc-${acc.id}" onclick="toggleChartSelect('${acc.id}')">
        <strong>${acc.name}</strong>
        <span>BDT ${Number(acc.balance).toLocaleString()}</span>
      </div>
      `;
    }
  });
  document.getElementById('chartAccountsList').innerHTML = html;
}

function toggleChartSelect(id) {
  if (chartSelectedSet.has(id)) {
    chartSelectedSet.delete(id);
  } else {
    chartSelectedSet.add(id);
  }
  loadChartAccounts(); 
  updateChartData();   
}

async function updateChartData() {
  const names = accountsData
    .filter(a => chartSelectedSet.size === 0 || chartSelectedSet.has(a.id))
    .map(a => a.name);

  let currentSum = 0;
  accountsData.forEach(acc => {
    if (chartSelectedSet.size === 0 || chartSelectedSet.has(acc.id)) {
      if (acc.name !== "OUT OF WALLET") currentSum += Number(acc.balance);
    }
  });
  document.getElementById('chartTotalBalance').innerText = currentSum.toLocaleString() + " BDT";

  const dailyData = {};
  const labels = [];
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 15); 

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateKey = d.toLocaleDateString('en-GB');
    dailyData[dateKey] = 0;
    labels.push(dateKey);
  }

  allTransactions.forEach(t => {
    const tDate = t.createdAt ? t.createdAt.toDate().toLocaleDateString('en-GB') : null;
    if (tDate && dailyData.hasOwnProperty(tDate)) {
      if (chartSelectedSet.size === 0 || names.includes(t.accName)) {
        if (t.type === 'income' || t.type === 'transfer_in') {
          dailyData[tDate] += Number(t.amount);
        } else if (t.type === 'expense' || t.type === 'transfer_out') {
          dailyData[tDate] -= Number(t.amount);
        }
      }
    }
  });

  let cumulativeBalance = currentSum;
  const dataValues = [];

  for (let i = labels.length - 1; i >= 0; i--) {
    dataValues[i] = cumulativeBalance;
    cumulativeBalance -= dailyData[labels[i]]; 
  }

  renderLineChart(labels, dataValues);
}

function renderLineChart(labels, values) {
  const canvas = document.getElementById('balanceChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (myChart) myChart.destroy();

  myChart = new Chart(ctx, {
    type: 'line', 
    data: {
      labels,
      datasets: [{
        label: 'Balance Trend (BDT)',
        data: values,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        borderWidth: 3,
        tension: 0.3,
        fill: true,
        pointRadius: 4,
        pointBackgroundColor: '#2563eb'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { 
          grid: { color: '#f3f4f6' },
          ticks: {
            callback: function(value) { return value.toLocaleString() + ' ৳'; }
          }
        },
        x: { grid: { display: false } }
      },
      plugins: {
        legend: { display: true, position: 'top' }
      }
    }
  });
}

// ==========================
// RECURRING
// ==========================
function openRecurringAddModal() {
  const selectCommon = document.getElementById('recAccId');
  const selectFrom = document.getElementById('recFromAcc');
  const selectTo = document.getElementById('recToAcc');
  
  selectCommon.innerHTML = '';
  selectFrom.innerHTML = '';
  selectTo.innerHTML = '';

  accountsData.forEach(acc => {
    const opt1 = document.createElement('option'); opt1.value = acc.id; opt1.text = acc.name;
    selectCommon.add(opt1);
    
    const opt2 = document.createElement('option'); opt2.value = acc.id; opt2.text = acc.name;
    selectFrom.add(opt2);

    const opt3 = document.createElement('option'); opt3.value = acc.id; opt3.text = acc.name;
    selectTo.add(opt3);
  });
  
  toggleRecurringFields();
  document.getElementById('recurringModal').style.display = 'flex';
}

async function saveRecurringInstruction() {
  const user = auth.currentUser;
  const type = document.getElementById('recType').value;
  const amount = Number(document.getElementById('recAmount').value);
  const note = document.getElementById('recNote').value;
  const day = Number(document.getElementById('recDay').value);

  if (!amount || !day) return alert("সব তথ্য দিন");

  let payload = {
    type, amount, note, day,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (type === 'transfer') {
    const fromId = document.getElementById('recFromAcc').value;
    const toId = document.getElementById('recToAcc').value;
    if (fromId === toId) return alert("Source and destination accounts must be different");
    
    const fromAcc = accountsData.find(a => a.id === fromId);
    const toAcc = accountsData.find(a => a.id === toId);
    
    payload.fromAccId = fromId;
    payload.fromAccName = fromAcc.name;
    payload.toAccId = toId;
    payload.toAccName = toAcc.name;
  } else {
    const accId = document.getElementById('recAccId').value;
    const acc = accountsData.find(a => a.id === accId);
    payload.accId = accId;
    payload.accName = acc.name;
  }

  await db.collection('users').doc(user.uid).collection('recurring').add(payload);

  alert("Saved");
  closeModal('recurringModal');
  loadRecurringList();
}

async function loadRecurringList() {
  const user = auth.currentUser;
  if (!user) return;

  const snapshot = await db.collection('users').doc(user.uid).collection('recurring').get();
  let html = '';

  snapshot.forEach(doc => {
    const d = doc.data();
    let accountInfo = d.type === 'transfer' ? `${d.fromAccName} ➔ ${d.toAccName}` : d.accName;
    html += `
    <div class="card" style="margin-bottom:8px; padding:10px;">
      <strong>${d.type.toUpperCase()}</strong><br>
      ${accountInfo}<br>
      ${Number(d.amount).toLocaleString()} BDT<br>
      Every Month Day: ${d.day} <br>
      <button onclick="deleteSI('${doc.id}')" style="background:red;margin-top:5px;color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;">Delete</button>
    </div>
    `;
  });

  document.getElementById('recurringList').innerHTML = html || "No recurring instruction";
}

async function deleteSI(id) {
  const user = auth.currentUser;
  if (!confirm("Delete?")) return;

  await db.collection('users').doc(user.uid).collection('recurring').doc(id).delete();
  loadRecurringList();
}

// ==========================
// INDIVIDUAL ACCOUNT STATEMENT (UPDATED WITH NO & TYPE)
// ==========================
function loadStatementAccounts() {
  const select = document.getElementById('statementAccSelect');
  select.innerHTML = '';
  accountsData.forEach(acc => {
    const opt = document.createElement('option');
    opt.value = acc.name; opt.text = acc.name;
    select.add(opt);
  });
}

async function generateStatement() {
  const targetAccName = document.getElementById('statementAccSelect').value;
  const startInput = document.getElementById('statementStartDate').value;
  const endInput = document.getElementById('statementEndDate').value;

  if (!targetAccName || !startInput || !endInput) return alert("Account এবং Date Range সিলেক্ট করুন");

  // খুঁজে বের করা একাউন্ট এর মেটাডেটা (নাম্বার এবং টাইপ)
  const activeAcc = accountsData.find(a => a.name === targetAccName);
  const accNo = activeAcc && activeAcc.accountNumber ? activeAcc.accountNumber : 'N/A';
  const accType = activeAcc && activeAcc.accountType ? activeAcc.accountType : 'Savings';

  const startDate = new Date(startInput); startDate.setHours(0,0,0,0);
  const endDate = new Date(endInput); endDate.setHours(23,59,59,999);

  const sortedTransactions = [...allTransactions]
    .filter(t => t.accName === targetAccName && t.createdAt)
    .sort((a, b) => a.createdAt.toDate() - b.createdAt.toDate());

  let openingBalance = 0;
  const periodTransactions = [];

  sortedTransactions.forEach(t => {
    const tDate = t.createdAt.toDate();
    if (tDate < startDate) {
      if (t.type === 'income' || t.type === 'transfer_in') openingBalance += Number(t.amount);
      else if (t.type === 'expense' || t.type === 'transfer_out') openingBalance -= Number(t.amount);
    } else if (tDate >= startDate && tDate <= endDate) {
      periodTransactions.push(t);
    }
  });

  // প্রিন্ট সেকশনে অফিশিয়াল মেটাডেটা পুশ করা
  document.getElementById('printAccName').innerText = `Account: ${targetAccName}`;
  document.getElementById('printAccDetails').innerText = `Type: ${accType} | A/C No: ${accNo}`;
  document.getElementById('printDateRange').innerText = `Period: ${startDate.toLocaleDateString('en-GB')} to ${endDate.toLocaleDateString('en-GB')}`;

  let tableHtml = `
    <tr style="background-color: #f3f4f6; font-weight: bold;">
      <td>-</td> <td>OPENING BALANCE</td> <td>-</td> <td>-</td>
      <td style="text-align: right;">${openingBalance.toLocaleString()} ৳</td>
    </tr>
  `;
  
  let runningBalance = openingBalance;
  periodTransactions.forEach(t => {
    let cr = '-'; let dr = '-'; const amt = Number(t.amount);
    if (t.type === 'income' || t.type === 'transfer_in') { cr = amt.toLocaleString() + " ৳"; runningBalance += amt; }
    else if (t.type === 'expense' || t.type === 'transfer_out') { dr = amt.toLocaleString() + " ৳"; runningBalance -= amt; }
    let label = t.type === 'income' ? 'জমা' : t.type === 'expense' ? 'খরচ' : t.type === 'transfer_in' ? 'স্থানান্তর (In)' : 'স্থানান্তর (Out)';
    
    tableHtml += `
      <tr>
        <td>${t.createdAt.toDate().toLocaleDateString('en-GB')}</td>
        <td><strong>${label}</strong>${t.note ? ' ('+t.note+')' : ''}</td>
        <td style="color: #16a34a; text-align: right;">${cr}</td>
        <td style="color: #dc2626; text-align: right;">${dr}</td>
        <td style="font-weight: bold; text-align: right;">${runningBalance.toLocaleString()} ৳</td>
      </tr>
    `;
  });
  document.getElementById('statementTableBody').innerHTML = tableHtml;
  document.getElementById('printableStatementArea').style.display = 'block';
}

// ==========================
// INCOME EXPENSE STATEMENT LOGIC
// ==========================
async function generateIncomeExpenseStatement() {
  const startInput = document.getElementById('ieStartDate').value;
  const endInput = document.getElementById('ieEndDate').value;

  if (!startInput || !endInput) return alert("দয়া করে Date Range সিলেক্ট করুন");

  const startDate = new Date(startInput); startDate.setHours(0,0,0,0);
  const endDate = new Date(endInput); endDate.setHours(23,59,59,999);

  if (startDate > endDate) return alert("Start Date অবশ্যই End Date এর আগের হতে হবে");

  const sortedIETransactions = [...allTransactions]
    .filter(t => (t.type === 'income' || t.type === 'expense') && t.createdAt)
    .sort((a, b) => a.createdAt.toDate() - b.createdAt.toDate());

  let openingBalance = 0;
  let totalIncome = 0;
  let totalExpense = 0;
  const periodTransactions = [];

  sortedIETransactions.forEach(t => {
    const tDate = t.createdAt.toDate();
    if (tDate < startDate) {
      if (t.type === 'income') openingBalance += Number(t.amount);
      else if (t.type === 'expense') openingBalance -= Number(t.amount);
    } else if (tDate >= startDate && tDate <= endDate) {
      periodTransactions.push(t);
    }
  });

  document.getElementById('printIEDateRange').innerText = `Period: ${startDate.toLocaleDateString('en-GB')} to ${endDate.toLocaleDateString('en-GB')}`;

  let tableHtml = `
    <tr style="background-color: #f3f4f6; font-weight: bold;">
      <td>-</td> <td>OPENING BALANCE (প্রারম্ভিক স্থিতি)</td> <td>-</td> <td>-</td>
      <td style="text-align: right;">${openingBalance.toLocaleString()} ৳</td>
    </tr>
  `;

  let runningBalance = openingBalance;
  periodTransactions.forEach(t => {
    let incomeAmt = '-'; let expenseAmt = '-'; const amt = Number(t.amount);

    if (t.type === 'income') {
      incomeAmt = amt.toLocaleString() + " ৳"; runningBalance += amt; totalIncome += amt;
    } else if (t.type === 'expense') {
      expenseAmt = amt.toLocaleString() + " ৳"; runningBalance -= amt; totalExpense += amt;
    }
    let label = t.type === 'income' ? 'জমা' : 'পেমেন্ট';

    tableHtml += `
      <tr>
        <td>${t.createdAt.toDate().toLocaleDateString('en-GB')}</td>
        <td><strong>${label}</strong> - ${t.accName}${t.note ? ' ('+t.note+')' : ''}</td>
        <td style="color: #16a34a; text-align: right;">${incomeAmt}</td>
        <td style="color: #dc2626; text-align: right;">${expenseAmt}</td>
        <td style="font-weight: bold; text-align: right;">${runningBalance.toLocaleString()} ৳</td>
      </tr>
    `;
  });

  tableHtml += `
    <tr style="background-color: #e5e7eb; font-weight: bold; border-top: 2px solid #1e293b;">
      <td colspan="2" style="text-align: center;">সর্বমোট (Total)</td>
      <td style="color: #16a34a; text-align: right;">${totalIncome.toLocaleString()} ৳</td>
      <td style="color: #dc2626; text-align: right;">${totalExpense.toLocaleString()} ৳</td>
      <td style="text-align: right; background-color: #dbeafe;">${runningBalance.toLocaleString()} ৳</td>
    </tr>
  `;

  document.getElementById('ieTableBody').innerHTML = tableHtml;
  document.getElementById('printableIEArea').style.display = 'block';
}

function printStatement() {
  window.print();
}

// ==========================
// CRITICAL SECURE ACCOUNT DELETION LOGIC
// ==========================
function triggerDeleteAccount() {
  const doubleCheck = confirm("আপনি কি নিশ্চিতভাবেই আপনার প্রোফাইল এবং ডাটাবেজের সমস্ত রেকর্ড চিরতরে ডিলিট করতে চান? এই কাজ আর ফিরিয়ে আনা যাবে না!");
  if (!doubleCheck) return;
  
  document.getElementById('deleteConfirmPassword').value = '';
  document.getElementById('deleteAuthModal').style.display = 'flex';
}

async function executeAccountDeletion() {
  const user = auth.currentUser;
  if (!user) return alert("কোন সেশন খুঁজে পাওয়া যায়নি। অনুগ্রহ করে আবার লগইন করুন।");

  const password = document.getElementById('deleteConfirmPassword').value;
  if (!password) return alert("নিরাপত্তার জন্য আপনার একাউন্টের পাসওয়ার্ডটি দিন");

  try {
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
    await user.reauthenticateWithCredential(credential);

    const accountsSnap = await db.collection('users').doc(user.uid).collection('accounts').get();
    const accPromises = accountsSnap.docs.map(doc => doc.ref.delete());
    await Promise.all(accPromises);

    const transSnap = await db.collection('users').doc(user.uid).collection('transactions').get();
    const transPromises = transSnap.docs.map(doc => doc.ref.delete());
    await Promise.all(transPromises);

    const recurringSnap = await db.collection('users').doc(user.uid).collection('recurring').get();
    const recPromises = recurringSnap.docs.map(doc => doc.ref.delete());
    await Promise.all(recPromises);

    await db.collection('users').doc(user.uid).delete();
    await user.delete();

    alert("আপনার অ্যাকাউন্ট এবং সমস্ত ডেটা সফলভাবে ডিলিট করা হয়েছে।");
    closeModal('deleteAuthModal');
  } catch (error) {
    console.error(error);
    alert("ভুল পাসওয়ার্ড অথবা কোনো টেকনিক্যাল সমস্যা হয়েছে। অনুগ্রহ করে সঠিক পাসওয়ার্ড দিয়ে আবার চেষ্টা করুন। এরর: " + error.message);
  }
}

// ==========================
// CORE VIEW CONTROLLER
// ==========================
function showSection(id) {
  document.getElementById('main-content').style.display = 'none';
  document.getElementById('recurring-section').style.display = 'none';
  document.getElementById('chart-section').style.display = 'none';
  document.getElementById('statement-section').style.display = 'none';
  document.getElementById('income-expense-section').style.display = 'none';
  
  document.getElementById(id).style.display = 'block';

  if (id === 'chart-section') {
    chartSelectedSet.clear(); 
    loadChartAccounts();
    updateChartData();
  } else if (id === 'statement-section') {
    loadStatementAccounts();
    document.getElementById('printableStatementArea').style.display = 'none';
  } else if (id === 'income-expense-section') {
    document.getElementById('printableIEArea').style.display = 'none';
  } else {
    loadData();
  }
}

// ==========================
// UTILITIES
// ==========================
function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

function toggleSidebar(id) {
  const sb = document.getElementById(id);
  sb.style.width = sb.style.width === '250px' ? '0' : '250px';
}

// ==========================
// UTILITIES
// ==========================
function toggleRecurringFields() {
  const type = document.getElementById('recType').value;
  if (type === 'transfer') {
    document.getElementById('commonAccField').style.display = 'none';
    document.getElementById('transferFields').style.display = 'block';
  } else {
    document.getElementById('commonAccField').style.display = 'block';
    document.getElementById('transferFields').style.display = 'none';
  }
}