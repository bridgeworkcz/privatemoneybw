let token = localStorage.getItem('token');
let userRole = localStorage.getItem('role');

// Ініціалізація при завантаженні сторінки
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    if (token) {
        showDashboard();
    }
});

function showView(viewName) {
    document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
    document.getElementById(`view-${viewName}`).classList.remove('hidden');
}

// Отримання глобальних контактів сайту (бачать усі користувачі)
async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        document.getElementById('site-phone').innerText = data.phone || '—';
        document.getElementById('site-email').innerText = data.email || '—';
        document.getElementById('site-crypto').innerText = data.crypto_wallet || '—';
    } catch (e) {
        console.error('Помилка завантаження налаштувань', e);
    }
}

// Авторизація користувача
async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-pass').value;

    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    
    const data = await res.json();
    if (data.token) {
        token = data.token;
        userRole = data.role;
        localStorage.setItem('token', token);
        localStorage.setItem('role', userRole);
        showDashboard();
    } else {
        alert(data.error || 'Помилка входу');
    }
}

// Реєстрація нового користувача
async function handleRegister() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-pass').value;

    const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name: email.split('@')[0] })
    });

    const data = await res.json();
    if (data.success) {
        alert('Реєстрація успішна! Тепер ви можете увійти.');
    } else {
        alert(data.error || 'Помилка реєстрації');
    }
}

function showDashboard() {
    if (userRole === 'admin') {
        showView('admin');
        loadAdminData();
    } else {
        showView('client');
        loadClientData();
    }
}

// Логіка Клієнта: Подача заявки та завантаження файлу
async function handleCreateApp() {
    const title = document.getElementById('app-title').value;
    const fileInput = document.getElementById('app-file');
    
    if (!title) {
        alert('Введіть назву справи!');
        return;
    }

    const formData = new FormData();
    formData.append('title', title);
    if (fileInput.files[0]) {
        formData.append('file', fileInput.files[0]);
    }

    const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
    });

    if (res.ok) {
        document.getElementById('app-title').value = '';
        fileInput.value = '';
        loadClientData();
    } else {
        alert('Помилка при створенні заявки');
    }
}

async function loadClientData() {
    const res = await fetch('/api/my-applications', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const apps = await res.json();
    const list = document.getElementById('client-list');
    
    if (apps.length === 0) {
        list.innerHTML = '<p class="text-gray-500">У вас поки немає поданих справ.</p>';
        return;
    }

    list.innerHTML = apps.map(app => `
        <div class="bg-white p-4 rounded shadow border">
            <h4 class="font-bold text-lg">${app.title}</h4>
            <p class="my-1">Статус: <span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-sm font-semibold">${app.status}</span></p>
            ${app.filepath ? `<a href="/${app.filepath}" target="_blank" class="text-green-600 hover:underline font-medium">📎 Завантажити файл (${app.filename})</a>` : '<span class="text-gray-400 text-sm">Файл не додано</span>'}
        </div>
    `).join('');
}

// Логіка Адміністратора: Редагування та перегляд
async function loadAdminData() {
    const res = await fetch('/api/admin/applications', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const apps = await res.json();
    const table = document.getElementById('admin-table');
    
    table.innerHTML = apps.map(app => `
        <tr class="border-b hover:bg-gray-50">
            <td class="p-3">#${app.id}</td>
            <td class="p-3">${app.client_name} <br><span class="text-xs text-gray-500">${app.email}</span></td>
            <td class="p-3 font-medium">${app.title}</td>
            <td class="p-3">${app.filepath ? `<a href="/${app.filepath}" target="_blank" class="text-blue-600 underline text-sm">Файл</a>` : '—'}</td>
            <td class="p-3"><span class="font-bold">${app.status}</span></td>
            <td class="p-3">
                <select onchange="updateStatus(${app.id}, this.value)" class="border rounded p-1 text-sm">
                    <option value="Pending" ${app.status==='Pending'?'selected':''}>Pending</option>
                    <option value="In Progress" ${app.status==='In Progress'?'selected':''}>In Progress</option>
                    <option value="Approved" ${app.status==='Approved'?'selected':''}>Approved</option>
                    <option value="Rejected" ${app.status==='Rejected'?'selected':''}>Rejected</option>
                </select>
            </td>
        </tr>
    `).join('');
}

async function updateStatus(id, status) {
    await fetch(`/api/admin/applications/${id}/status`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status })
    });
    loadAdminData();
}

// Адмін змінює контакти/криптогаманець для всього сайту
async function handleSaveSettings() {
    const phone = document.getElementById('admin-phone').value;
    const email = document.getElementById('admin-email').value;
    const crypto_wallet = document.getElementById('admin-crypto').value;

    const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ phone, email, crypto_wallet })
    });

    if (res.ok) {
        alert('Дані сайту оновлено!');
        loadSettings();
    } else {
        alert('Не вдалося оновити дані');
    }
}
