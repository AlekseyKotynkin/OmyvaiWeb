// seed-operation-expense.js

function log(message) {
    const el = document.getElementById("log");
    el.textContent += message + "\n";
  }
  
  // ассортимент
  const washerWinterAssortment = [
    { name: "-10", price: "20", price_new: "15" },
    { name: "-15", price: "35", price_new: "30" },
    { name: "-20", price: "40", price_new: "35" },
    { name: "-25", price: "50", price_new: "50" },
    { name: "-30", price: "60", price_new: "50" }
  ];
  
  function getRandomQuantity() {
    const steps = [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
    return steps[Math.floor(Math.random() * steps.length)];
  }
  
  function getRandomPaymentMethod() {
    const methods = ["card", "cash", "bonus"];
    return methods[Math.floor(Math.random() * methods.length)];
  }
  
  function pad2(n) {
    return n.toString().padStart(2, "0");
  }
  
  function buildTransactionNumber(machineId, index) {
    const now = new Date();
    const y = now.getFullYear();
    const m = pad2(now.getMonth() + 1);
    const d = pad2(now.getDate());
    const hh = pad2(now.getHours());
    const mm = pad2(now.getMinutes());
    const ss = pad2(now.getSeconds());
    return `${machineId}_${y}${m}${d}_${hh}${mm}${ss}_${index}`;
  }
  
  async function generateOperationExpenseDocs() {
    // db и firebase уже есть из firebase-config.js
    const colRef = db.collection("operation_expense");
  
    const machineId = "ven_00001";
    const serviceType = "WASHER_FLUID";
    const units = "литр";
  
    for (let i = 1; i <= 20; i++) {
      const assortment =
        washerWinterAssortment[
          Math.floor(Math.random() * washerWinterAssortment.length)
        ];
  
      const quantity = getRandomQuantity();
      const priceStr = assortment.price;
      const priceNewStr = assortment.price_new || assortment.price;
  
      const priceNum = parseFloat(priceNewStr);
      const sumNum = quantity * priceNum;
  
      const paymentMethod = getRandomPaymentMethod();
      const transaction_number = buildTransactionNumber(machineId, i);
  
      const now = new Date();
      const startedAtDate = new Date(
        now.getTime() - (20 + Math.random() * 40) * 1000
      );
      const finishedAtDate = now;
  
      const docData = {
        machineId: machineId,
        serviceType: serviceType,
        nomenclature: assortment.name,
        units: units,
  
        paymentMethod: paymentMethod,
  
        price: priceStr,
        price_new: priceNewStr,
        quantity: quantity.toString(),
        sum: sumNum.toFixed(2),
  
        transaction_number: transaction_number,
  
        startedAt: firebase.firestore.Timestamp.fromDate(startedAtDate),
        finishedAt: firebase.firestore.Timestamp.fromDate(finishedAtDate),
        createdAt: firebase.firestore.Timestamp.fromDate(finishedAtDate)
      };
  
      const docRef = await colRef.add(docData);
      log(`Добавлен документ #${i}: ${docRef.id} (${quantity} л, ${docData.nomenclature})`);
    }
  
    log("Готово: 20 документов в operation_expense создано.");
  }
  
  window.addEventListener("DOMContentLoaded", () => {
    document
      .getElementById("seed-btn")
      .addEventListener("click", () => {
        generateOperationExpenseDocs().catch(e => {
          console.error(e);
          log("Ошибка: " + e.message);
        });
      });
  });
  