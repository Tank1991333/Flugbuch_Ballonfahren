const SUPABASE_URL = "https://yswbobxtlqkkjnrrpyfy.supabase.co/rest/v1/";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlzd2JvYnh0bHFra2pucnJweWZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MDUyMDUsImV4cCI6MjEwNTE4MTIwNX0.GcqK2b3OfmdL_AQVKTk2wQFFhpUBFMZppp3lgUhcp18";

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
