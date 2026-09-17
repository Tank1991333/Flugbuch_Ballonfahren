const SUPABASE_URL = "DEINE_URL";
const SUPABASE_KEY = "DEIN_KEY";

const supabase =
  window.supabase.createClient(
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

  alert("Anmeldung erfolgreich");
}
