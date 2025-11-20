export const fetchXml = async (url) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.error(`Error fetching XML (Gürmen Group → Ramsey brand): ${error.message}`);
    throw error;
  }
};
