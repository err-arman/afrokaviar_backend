const fetchChannels = async () => {
  try {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${process.env.VITE_SPREADSHEET_ID}/values/${process.env.VITE_RANGE}?key=${process.env.VITE_SPREADSHEET_API_KEY}`
    );
    const result = await response.json();

    if (result.values && result.values.length > 0) {
      const headers = result.values[0];
      const rows = result.values.slice(1);
      const formattedData = rows
        .filter((row) => row && row.length > 0 && row.some((value) => value))
        .map((row) => {
          const item =  {};
          row.forEach((value, index) => {
            item[headers[index]] = value;
          });
          return item;
        });

      return formattedData;
    }
  } catch (err) {
    console.error("Error fetching sheet data:", err);
  }
};

module.exports = { fetchChannels };
