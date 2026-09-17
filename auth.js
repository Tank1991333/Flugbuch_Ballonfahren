const SUPABASE_URL = "DEINE_SUPABASE_URL";
const SUPABASE_KEY = "DEIN_ANON_KEY";

const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

async function login() {

    const email =
        document.getElementById("email").value;

    const password =
        document.getElementById("password").value;

    const { error } =
        await supabase.auth.signInWithPassword({
            email,
            password
        });

    if (error) {
        alert(error.message);
        return;
    }

    document.getElementById("login-container").style.display = "none";
    document.getElementById("app-container").style.display = "block";
}

async function checkUser() {

    const {
        data: { session }
    } = await supabase.auth.getSession();

    if (session) {
        document.getElementById("login-container").style.display = "none";
        document.getElementById("app-container").style.display = "block";
    }
}

checkUser();
