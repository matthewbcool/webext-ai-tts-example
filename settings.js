function deleteCachedModels() {
  browser.trial.ml.deleteCachedModels().then(() => {
    alert('Model cache cleared.');
  });
}

async function askPermission() {
  await browser.permissions.request({ permissions: ['trialML'] });
  await updateGranted();
}

async function updateGranted() {
  const granted = await browser.permissions.contains({
    permissions: ['trialML'],
  });
  document.body.classList.toggle('granted', granted);
}

document.querySelector('#grant').addEventListener('click', askPermission);
document.querySelector('#clear').addEventListener('click', deleteCachedModels);
updateGranted();
